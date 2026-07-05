import { describe, it, expect } from 'vitest'
import { accountBalanceSeries } from './accountBalance'
import { dailyPnlSeries } from './tradeAggregates'

describe('accountBalanceSeries', () => {
  const daily = dailyPnlSeries([
    { date: '2026-07-01', pnl: 100 },
    { date: '2026-07-02', pnl: -50 },
    { date: '2026-07-03', pnl: 200 },
  ])

  it('offsets cumulative P&L by the starting balance', () => {
    const series = accountBalanceSeries(daily, 5000, [])
    expect(series.map((p) => p.balance)).toEqual([5100, 5050, 5250])
  })

  it('accumulates payouts received up to each date, ignoring later ones', () => {
    const payouts = [
      { date: '2026-07-02', received: 300 },
      { date: '2026-07-05', received: 100 }, // after the last trade date — never shows up
    ]
    const series = accountBalanceSeries(daily, 5000, payouts)
    expect(series.map((p) => p.withdrawals)).toEqual([0, 300, 300])
  })

  it('returns an empty series for no trading days', () => {
    expect(accountBalanceSeries([], 5000, [])).toEqual([])
  })
})
