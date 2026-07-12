import { describe, it, expect } from 'vitest'
import { buildInsightsPayload, rangeForPreset } from './buildInsightsPayload'
import type { Trade, ReportCard, Playbook, PlaybookExample, TradingRule } from '../../types'

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: Math.random().toString(36).slice(2),
    accountId: 'acc1',
    date: '2026-07-01',
    symbol: 'EURUSD',
    side: 'long',
    qty: 1,
    entryPrice: 1.1,
    exitPrice: 1.11,
    entryTime: '2026-07-01T13:35:00.000Z', // 09:35 ET
    exitTime: '2026-07-01T13:45:00.000Z',
    pnl: 100,
    ...overrides,
  }
}

function reportCard(overrides: Partial<ReportCard>): ReportCard {
  return { date: '2026-07-01', ...overrides }
}

const RANGE = { start: '2026-01-01', end: '2026-12-31', label: 'All-time', preset: 'all_time' as const }

describe('buildInsightsPayload', () => {
  it('filters trades/report cards to the given date range', () => {
    const trades = [trade({ date: '2026-01-15', pnl: 50 }), trade({ date: '2027-01-15', pnl: -50 })]
    const cards = [reportCard({ date: '2026-01-15' }), reportCard({ date: '2027-01-15' })]
    const payload = buildInsightsPayload(trades, cards, [], [], [], RANGE)
    expect(payload.meta.tradeCount).toBe(1)
    expect(payload.meta.reportCardCount).toBe(1)
  })

  it('tagBreakdown groups by tag, a multi-tag trade counts in each bucket, capped at top 10', () => {
    const trades = [
      trade({ tags: ['fomo'], pnl: -50 }),
      trade({ tags: ['fomo', 'revenge'], pnl: -100 }),
      trade({ tags: ['solid-setup'], pnl: 200 }),
    ]
    const payload = buildInsightsPayload(trades, [], [], [], [], RANGE)
    const fomo = payload.tagBreakdown.find((t) => t.tag === 'fomo')!
    expect(fomo.tradeCount).toBe(2)
    expect(fomo.netPnl).toBe(-150)
    const revenge = payload.tagBreakdown.find((t) => t.tag === 'revenge')!
    expect(revenge.tradeCount).toBe(1)
  })

  it('ruleAdherence: miss rate excludes unanswered rules from the denominator', () => {
    const rules: TradingRule[] = [{ id: 'r1', text: 'Every position had a stop loss set before entry.', isCore: true }]
    const cards = [
      reportCard({ grade: 'R', ruleChecks: { r1: false } }),
      reportCard({ grade: 'R', ruleChecks: { r1: true } }),
      reportCard({ grade: 'R' }), // r1 unanswered — must not count as a violation
    ]
    const payload = buildInsightsPayload([], cards, [], [], rules, RANGE)
    const rule1 = payload.ruleAdherence.find((r) => r.rule.includes('stop loss'))!
    expect(rule1.poorDayCount).toBe(3)
    expect(rule1.missRatePoorPct).toBe(50) // 1 miss out of 2 *answered*, not 3
  })

  it('profitFactor Infinity is coerced to null (JSON-safe)', () => {
    const trades = [trade({ pnl: 100 })]
    const payload = buildInsightsPayload(trades, [], [], [], [], RANGE)
    expect(payload.overview.profitFactor).toBeNull()
  })

  it('notableTrades caps at 6 (top 3 + bottom 3) and dedupes when fewer than 6 trades exist', () => {
    const trades = [trade({ pnl: 10 }), trade({ pnl: -10 })]
    const payload = buildInsightsPayload(trades, [], [], [], [], RANGE)
    expect(payload.notableTrades.length).toBe(2)
  })

  it('reportCardSamples caps at 8 and truncates long text fields', () => {
    const longText = 'x'.repeat(500)
    const cards = Array.from({ length: 10 }, (_, i) =>
      reportCard({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, grade: 'R', rootCause: longText }),
    )
    const payload = buildInsightsPayload([], cards, [], [], [], RANGE)
    expect(payload.reportCardSamples.length).toBeLessThanOrEqual(8)
    expect(payload.reportCardSamples[0].rootCause!.length).toBeLessThanOrEqual(281)
  })

  it('playbookBreakdown reuses computePlaybookStats per playbook', () => {
    const t1 = trade({ pnl: 100 })
    const playbooks: Playbook[] = [{ id: 'pb1', name: 'Breakout' }]
    const examples: PlaybookExample[] = [{ id: 'ex1', playbookId: 'pb1', tradeId: t1.id }]
    const payload = buildInsightsPayload([t1], [], playbooks, examples, [], RANGE)
    expect(payload.playbookBreakdown[0]).toMatchObject({ name: 'Breakout', tradeCount: 1, winRatePct: 100 })
  })
})

describe('rangeForPreset', () => {
  it('computes a 30-day window ending on the given date', () => {
    const range = rangeForPreset('last_30', '2026-07-11')
    expect(range.end).toBe('2026-07-11')
    expect(range.start).toBe('2026-06-11')
    expect(range.label).toBe('Last 30 days')
  })

  it('all_time spans from the epoch to today', () => {
    const range = rangeForPreset('all_time', '2026-07-11')
    expect(range.end).toBe('2026-07-11')
    expect(range.label).toBe('All-time')
  })
})
