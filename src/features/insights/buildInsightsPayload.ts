import type { Playbook, PlaybookExample, ReportCard, Trade, TradingRule } from '../../types'
import {
  netPnl, winRate, profitFactor, outcomeCounts, avgWin, avgLoss, dayWinRate,
  avgTradeDurationMinutes, avgWinDurationMinutes, avgLossDurationMinutes, longPct, bestTrade, worstTrade,
} from '../../utils/tradeStats'
import { dailyPnlSeries, weekdayStats } from '../../utils/tradeAggregates'
import { realizedRMultiple } from '../../utils/tradeRisk'
import { playbookLinkedTrades, computePlaybookStats } from '../playbooks/playbookStats'

export type InsightsRangePreset = 'last_30' | 'last_60' | 'last_90' | 'all_time'

export interface InsightsRange {
  start: string
  end: string
  label: string
  preset: InsightsRangePreset
}

export function rangeForPreset(preset: InsightsRangePreset, todayISO: string): InsightsRange {
  const end = todayISO
  if (preset === 'all_time') return { start: '0000-01-01', end, label: 'All-time', preset }
  const days = preset === 'last_30' ? 30 : preset === 'last_60' ? 60 : 90
  const startDate = new Date(todayISO)
  startDate.setDate(startDate.getDate() - days)
  const start = startDate.toISOString().slice(0, 10)
  const label = preset === 'last_30' ? 'Last 30 days' : preset === 'last_60' ? 'Last 60 days' : 'Last 90 days'
  return { start, end, label, preset }
}

const TRUNCATE = (text: string | undefined, max: number): string | null => {
  if (!text) return null
  return text.length > max ? `${text.slice(0, max)}…` : text
}

// Buckets by NY-local minutes-since-midnight — same NY-zone convention as TradeStatsTab's
// timezone toggle, so "9:30am" here means the same instant a trader reviewing that stat would expect.
function timeOfDayBucket(entryTimeISO: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(entryTimeISO))
  const hour = Number(parts.find((p) => p.type === 'hour')!.value)
  const minute = Number(parts.find((p) => p.type === 'minute')!.value)
  const totalMinutes = hour * 60 + minute

  if (totalMinutes < 9 * 60 + 30) return 'Pre-Market'
  if (totalMinutes < 10 * 60 + 30) return 'Open'
  if (totalMinutes < 14 * 60) return 'Midday'
  if (totalMinutes < 16 * 60) return 'Power Hour'
  return 'After-Hours'
}

export interface InsightsPayload {
  meta: { rangeStart: string; rangeEnd: string; rangeLabel: string; tradeCount: number; reportCardCount: number }
  overview: {
    netPnl: number; winRatePct: number; profitFactor: number | null
    outcomeCounts: { wins: number; breakeven: number; losses: number }
    avgWin: number; avgLoss: number; dayWinRatePct: number
    avgTradeDurationMinutes: number; avgWinDurationMinutes: number; avgLossDurationMinutes: number
    longPct: number
    bestTrade: { symbol: string; date: string; pnl: number } | null
    worstTrade: { symbol: string; date: string; pnl: number } | null
  }
  weekdayBreakdown: { weekday: string; pnl: number; tradeCount: number }[]
  timeOfDayBreakdown: { bucket: string; tradeCount: number; winRatePct: number; netPnl: number }[]
  tagBreakdown: { tag: string; tradeCount: number; winRatePct: number; netPnl: number }[]
  playbookBreakdown: { name: string; grade: string | null; tradeCount: number; winRatePct: number | null; netPnl: number | null; minR: number | null; maxR: number | null }[]
  ruleAdherence: { rule: string; core: boolean; missRatePoorPct: number | null; missRateGoodPct: number | null; poorDayCount: number; goodDayCount: number }[]
  gradeDistribution: { grade: string; count: number }[]
  notableTrades: { symbol: string; side: 'long' | 'short'; date: string; pnl: number; rMultiple: number | null; tags: string[]; rating: number | null; notes: string | null }[]
  reportCardSamples: { date: string; grade: string | null; whyProblem: string | null; rootCause: string | null; counterMeasure: string | null; didWell: string | null }[]
}

export function buildInsightsPayload(
  trades: Trade[],
  reportCards: ReportCard[],
  playbooks: Playbook[],
  playbookExamples: PlaybookExample[],
  rules: TradingRule[],
  range: InsightsRange,
): InsightsPayload {
  const rangeTrades = trades.filter((t) => t.date >= range.start && t.date <= range.end)
  const rangeCards = reportCards.filter((c) => c.date >= range.start && c.date <= range.end)
  const daily = dailyPnlSeries(rangeTrades)

  const pf = profitFactor(rangeTrades)

  // --- tag breakdown (top 10 by trade count) ---
  const tagMap = new Map<string, Trade[]>()
  for (const t of rangeTrades) {
    for (const tag of t.tags ?? []) {
      const list = tagMap.get(tag) ?? []
      list.push(t)
      tagMap.set(tag, list)
    }
  }
  const tagBreakdown = [...tagMap.entries()]
    .map(([tag, list]) => ({ tag, tradeCount: list.length, winRatePct: winRate(list) * 100, netPnl: netPnl(list) }))
    .sort((a, b) => b.tradeCount - a.tradeCount)
    .slice(0, 10)

  // --- time-of-day breakdown ---
  const todMap = new Map<string, Trade[]>()
  for (const t of rangeTrades) {
    const bucket = timeOfDayBucket(t.entryTime)
    const list = todMap.get(bucket) ?? []
    list.push(t)
    todMap.set(bucket, list)
  }
  const BUCKET_ORDER = ['Pre-Market', 'Open', 'Midday', 'Power Hour', 'After-Hours']
  const timeOfDayBreakdown = BUCKET_ORDER.filter((b) => todMap.has(b)).map((bucket) => {
    const list = todMap.get(bucket)!
    return { bucket, tradeCount: list.length, winRatePct: winRate(list) * 100, netPnl: netPnl(list) }
  })

  // --- playbook breakdown (reuses the exact Playbooks-page stats function) ---
  const playbookBreakdown = playbooks.map((p) => {
    const linked = playbookLinkedTrades(p.id!, playbookExamples, rangeTrades)
    const stats = computePlaybookStats(linked)
    return {
      name: p.name, grade: p.grade ?? null,
      tradeCount: stats.tradeCount,
      winRatePct: stats.winRatePct, netPnl: stats.netPnl, minR: stats.minR, maxR: stats.maxR,
    }
  })

  // --- rule adherence vs. outcome ---
  const poorDays = rangeCards.filter((c) => c.grade === 'R' || c.grade === 'C')
  const goodDays = rangeCards.filter((c) => c.grade === 'A' || c.grade === 'B')
  const missRate = (cards: ReportCard[], ruleId: string): number | null => {
    const answered = cards.filter((c) => c.ruleChecks?.[ruleId] !== undefined)
    if (answered.length === 0) return null
    return (answered.filter((c) => c.ruleChecks![ruleId] === false).length / answered.length) * 100
  }
  const ruleAdherence = rules.map((r) => ({
    rule: r.text, core: r.isCore ?? false,
    missRatePoorPct: missRate(poorDays, r.id!), missRateGoodPct: missRate(goodDays, r.id!),
    poorDayCount: poorDays.length, goodDayCount: goodDays.length,
  }))

  // --- grade distribution ---
  const gradeCounts = new Map<string, number>()
  for (const c of rangeCards) {
    if (!c.grade) continue
    gradeCounts.set(c.grade, (gradeCounts.get(c.grade) ?? 0) + 1)
  }
  const gradeDistribution = [...gradeCounts.entries()].map(([grade, count]) => ({ grade, count }))

  // --- notable trades: top 3 + bottom 3 by pnl ---
  const sortedByPnl = [...rangeTrades].sort((a, b) => b.pnl - a.pnl)
  const notable = [...sortedByPnl.slice(0, 3), ...sortedByPnl.slice(-3)]
  const seen = new Set<string | undefined>()
  const notableTrades = notable
    .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))) // dedupe if fewer than 6 trades total
    .map((t) => ({
      symbol: t.symbol, side: t.side, date: t.date, pnl: t.pnl,
      rMultiple: realizedRMultiple({ entryPrice: t.entryPrice, stopLoss: t.stopLoss, exitPrice: t.exitPrice, side: t.side }),
      tags: t.tags ?? [], rating: t.rating ?? null, notes: TRUNCATE(t.notes, 200),
    }))

  // --- report card qualitative samples: up to 5 richest R/C, up to 3 richest A, capped 8 ---
  const richness = (c: ReportCard) => [c.rootCause, c.counterMeasure, c.whyProblem].filter(Boolean).length
  const poorSamples = [...poorDays].filter((c) => richness(c) > 0).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5)
  const goodSamples = [...rangeCards].filter((c) => c.grade === 'A' && c.didWell).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3)
  const reportCardSamples = [...poorSamples, ...goodSamples].slice(0, 8).map((c) => ({
    date: c.date, grade: c.grade ?? null,
    whyProblem: TRUNCATE(c.whyProblem, 280), rootCause: TRUNCATE(c.rootCause, 280),
    counterMeasure: TRUNCATE(c.counterMeasure, 280), didWell: TRUNCATE(c.didWell, 280),
  }))

  return {
    meta: {
      rangeStart: range.start, rangeEnd: range.end, rangeLabel: range.label,
      tradeCount: rangeTrades.length, reportCardCount: rangeCards.length,
    },
    overview: {
      netPnl: netPnl(rangeTrades), winRatePct: winRate(rangeTrades) * 100,
      profitFactor: Number.isFinite(pf) ? pf : null, // Infinity can't survive JSON.stringify -> the API call
      outcomeCounts: outcomeCounts(rangeTrades),
      avgWin: avgWin(rangeTrades), avgLoss: avgLoss(rangeTrades),
      dayWinRatePct: dayWinRate(daily.map((d) => d.pnl)) * 100,
      avgTradeDurationMinutes: avgTradeDurationMinutes(rangeTrades),
      avgWinDurationMinutes: avgWinDurationMinutes(rangeTrades),
      avgLossDurationMinutes: avgLossDurationMinutes(rangeTrades),
      longPct: longPct(rangeTrades) * 100,
      bestTrade: (() => { const t = bestTrade(rangeTrades); return t ? { symbol: t.symbol, date: t.date, pnl: t.pnl } : null })(),
      worstTrade: (() => { const t = worstTrade(rangeTrades); return t ? { symbol: t.symbol, date: t.date, pnl: t.pnl } : null })(),
    },
    weekdayBreakdown: weekdayStats(daily),
    timeOfDayBreakdown,
    tagBreakdown,
    playbookBreakdown,
    ruleAdherence,
    gradeDistribution,
    notableTrades,
    reportCardSamples,
  }
}
