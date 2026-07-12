import type { Trade } from '../types'
import { dailyPnlSeries } from './tradeAggregates'

function sortByEntryTime(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime())
}

function groupByAccount(trades: Trade[]): Map<string, Trade[]> {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    const list = map.get(t.accountId) ?? []
    list.push(t)
    map.set(t.accountId, list)
  }
  return map
}

export interface RevengeTradeFlag {
  accountId: string
  priorTradeId: string
  priorTradeSymbol: string
  priorLoss: number
  tradeId: string
  tradeSymbol: string
  gapMinutes: number
  sizeIncreasePct: number | null // vs. this account's overall average qty — null if unknown/zero
}

const DEFAULT_MAX_GAP_MINUTES = 15

/** A new trade opened within minutes of a losing trade closing on the same account — the
 * objective signature of re-entering immediately to "win it back," independent of whether size
 * also increased (that's flagged too, but isn't required to count as revenge trading). */
export function detectRevengeTrades(trades: Trade[], maxGapMinutes = DEFAULT_MAX_GAP_MINUTES): RevengeTradeFlag[] {
  const flags: RevengeTradeFlag[] = []
  for (const [accountId, accountTrades] of groupByAccount(trades)) {
    const sorted = sortByEntryTime(accountTrades)
    const avgQty = sorted.reduce((sum, t) => sum + t.qty, 0) / sorted.length

    for (let i = 1; i < sorted.length; i++) {
      const prior = sorted[i - 1]
      const curr = sorted[i]
      if (prior.pnl >= 0) continue

      const gapMinutes = (new Date(curr.entryTime).getTime() - new Date(prior.exitTime).getTime()) / 60_000
      if (gapMinutes < 0 || gapMinutes > maxGapMinutes) continue

      flags.push({
        accountId,
        priorTradeId: prior.id!,
        priorTradeSymbol: prior.symbol,
        priorLoss: prior.pnl,
        tradeId: curr.id!,
        tradeSymbol: curr.symbol,
        gapMinutes: Math.round(gapMinutes),
        sizeIncreasePct: avgQty > 0 ? Math.round(((curr.qty - avgQty) / avgQty) * 100) : null,
      })
    }
  }
  return flags
}

export interface OvertradingDay {
  accountId: string
  date: string
  tradeCount: number
  averageDailyTradeCount: number
  ratio: number
}

const DEFAULT_MIN_RATIO = 2
const MIN_DAYS_FOR_BASELINE = 5
const MIN_TRADES_TO_FLAG = 3 // avoids flagging e.g. 2-trades-vs-1-average as "100% over"

/** A day with meaningfully more trades than *this account's own* historical daily average —
 * relative to your normal pace, not a fixed number, since a scalper's normal day looks nothing
 * like a swing trader's. Needs at least a few days of history before it'll flag anything. */
export function detectOvertrading(trades: Trade[], minRatio = DEFAULT_MIN_RATIO): OvertradingDay[] {
  const flags: OvertradingDay[] = []
  for (const [accountId, accountTrades] of groupByAccount(trades)) {
    const daily = dailyPnlSeries(accountTrades)
    if (daily.length < MIN_DAYS_FOR_BASELINE) continue

    const avgTradeCount = daily.reduce((sum, d) => sum + d.tradeCount, 0) / daily.length
    if (avgTradeCount === 0) continue

    for (const day of daily) {
      const ratio = day.tradeCount / avgTradeCount
      if (ratio >= minRatio && day.tradeCount >= MIN_TRADES_TO_FLAG) {
        flags.push({
          accountId,
          date: day.date,
          tradeCount: day.tradeCount,
          averageDailyTradeCount: Math.round(avgTradeCount * 10) / 10,
          ratio: Math.round(ratio * 10) / 10,
        })
      }
    }
  }
  return flags
}

export interface SizeEscalationFlag {
  accountId: string
  tradeIds: string[]
  symbol: string
  streakLength: number
  startQty: number
  endQty: number
  increasePct: number
}

const DEFAULT_MIN_STREAK = 3
const DEFAULT_MIN_INCREASE_PCT = 25

/** Position size climbing across a run of consecutive losses on the same account — the
 * objective signature of adding size to make the next win cover prior losses (martingale-style
 * escalation), regardless of whether the symbol changes within the streak. */
export function detectSizeEscalation(
  trades: Trade[],
  minStreakLength = DEFAULT_MIN_STREAK,
  minIncreasePct = DEFAULT_MIN_INCREASE_PCT,
): SizeEscalationFlag[] {
  const flags: SizeEscalationFlag[] = []
  for (const [accountId, accountTrades] of groupByAccount(trades)) {
    const sorted = sortByEntryTime(accountTrades)
    let streak: Trade[] = []

    const flushStreak = () => {
      if (streak.length >= minStreakLength) {
        const startQty = streak[0].qty
        const endQty = streak[streak.length - 1].qty
        const increasePct = startQty > 0 ? ((endQty - startQty) / startQty) * 100 : 0
        if (increasePct >= minIncreasePct) {
          flags.push({
            accountId,
            tradeIds: streak.map((t) => t.id!),
            symbol: streak[streak.length - 1].symbol,
            streakLength: streak.length,
            startQty,
            endQty,
            increasePct: Math.round(increasePct),
          })
        }
      }
      streak = []
    }

    for (const t of sorted) {
      if (t.pnl < 0) streak.push(t)
      else flushStreak()
    }
    flushStreak()
  }
  return flags
}

export interface DetectedTradePatterns {
  revengeTrades: RevengeTradeFlag[]
  overtradingDays: OvertradingDay[]
  sizeEscalations: SizeEscalationFlag[]
}

export function detectTradePatterns(trades: Trade[]): DetectedTradePatterns {
  return {
    revengeTrades: detectRevengeTrades(trades),
    overtradingDays: detectOvertrading(trades),
    sizeEscalations: detectSizeEscalation(trades),
  }
}
