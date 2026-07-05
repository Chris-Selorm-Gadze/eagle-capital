import { cumulativeSeries, type DailyPnl } from './tradeAggregates'

export interface BalancePoint {
  date: string
  balance: number
  withdrawals: number // cumulative payouts received, as of this date
}

/** Account balance over time = starting allocation + cumulative trade P&L, alongside
 * cumulative payouts received to date (the "Deposits / Withdrawals" reference line).
 * Both series are evaluated on trade-day dates, same as the rest of the dashboard's charts. */
export function accountBalanceSeries(
  daily: DailyPnl[],
  startingBalance: number,
  payouts: { date: string; received: number }[],
): BalancePoint[] {
  const cumulative = cumulativeSeries(daily)
  const sortedPayouts = [...payouts].sort((a, b) => (a.date < b.date ? -1 : 1))

  return cumulative.map(({ date, cumulative: pnl }) => ({
    date,
    balance: startingBalance + pnl,
    withdrawals: sortedPayouts.filter((p) => p.date <= date).reduce((sum, p) => sum + p.received, 0),
  }))
}
