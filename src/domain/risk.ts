// Self-imposed risk framework - mirrors the "Risk Management" tab of the Excel plan.

/** Risk per trade = 10% of remaining drawdown -> 10 consecutive max losses to fail. */
export function riskPerTrade(maxDrawdown: number): number {
  return maxDrawdown * 0.1
}

/** Daily stop = half the firm daily limit, or 30% of drawdown when the firm has none (Apex). */
export function dailyStop(firmDailyLimit: number | null, maxDrawdown: number): number {
  return firmDailyLimit !== null ? firmDailyLimit * 0.5 : maxDrawdown * 0.3
}

export function maxContracts(riskBudget: number, stopTicks: number, tickValue: number): number {
  const perContract = stopTicks * tickValue
  return perContract <= 0 ? 0 : Math.max(0, Math.floor(riskBudget / perContract))
}

export type BreakerLevel = 'ok' | 'break-30min' | 'done-for-day' | 'flat-for-week'

export function circuitBreaker(opts: {
  consecutiveLosses: number
  dayPnl: number
  dailyStopAmount: number
  consecutiveRedDays: number
}): BreakerLevel {
  if (opts.consecutiveRedDays >= 3) return 'flat-for-week'
  if (opts.consecutiveLosses >= 3 || opts.dayPnl <= -opts.dailyStopAmount) return 'done-for-day'
  if (opts.consecutiveLosses === 2) return 'break-30min'
  return 'ok'
}

/** How many full-risk losing trades fit inside today's stop before it's hit. */
export function maxTradesPerDay(dailyStopAmount: number, riskPerTradeAmount: number): number {
  return riskPerTradeAmount <= 0 ? 0 : Math.floor(dailyStopAmount / riskPerTradeAmount)
}

/** Count the trailing run of red (pnl < 0) days, most-recent-first, stopping at the first non-red day. */
export function consecutiveRedDays(pnlsMostRecentFirst: number[]): number {
  let n = 0
  for (const pnl of pnlsMostRecentFirst) {
    if (pnl < 0) n++
    else break
  }
  return n
}

const BREAKER_SEVERITY: Record<BreakerLevel, number> = {
  ok: 0,
  'break-30min': 1,
  'done-for-day': 2,
  'flat-for-week': 3,
}

export function worstBreaker(levels: BreakerLevel[]): BreakerLevel {
  return levels.reduce<BreakerLevel>(
    (worst, l) => (BREAKER_SEVERITY[l] > BREAKER_SEVERITY[worst] ? l : worst),
    'ok',
  )
}

/** Apex trade-copier risk: a done-for-day (or worse) breaker on any Apex account applies to all four. */
export function applyApexCopierRisk(own: BreakerLevel, allApexLevelsToday: BreakerLevel[]): BreakerLevel {
  const worst = worstBreaker(allApexLevelsToday)
  return BREAKER_SEVERITY[worst] >= BREAKER_SEVERITY['done-for-day'] ? worstBreaker([own, worst]) : own
}

export const TICK_VALUES: Record<string, number> = {
  ES: 12.5, MES: 1.25, NQ: 5, MNQ: 0.5, GC: 10, MGC: 1, CL: 10, MCL: 1, YM: 5, MYM: 0.5,
}
