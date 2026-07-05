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

export const TICK_VALUES: Record<string, number> = {
  ES: 12.5, MES: 1.25, NQ: 5, MNQ: 0.5, GC: 10, MGC: 1, CL: 10, MCL: 1, YM: 5, MYM: 0.5,
}
