import { describe, it, expect } from 'vitest'
import {
  netPnl, winRate, profitFactor, avgWin, avgLoss, dayWinRate, tradeDurationMinutes,
  avgTradeDurationMinutes, avgWinDurationMinutes, avgLossDurationMinutes,
  totalLotsTraded, longPct, bestTrade, worstTrade,
} from '../tradeStats'

const trades = [{ pnl: 100 }, { pnl: -50 }, { pnl: 200 }, { pnl: -25 }, { pnl: 0 }]

describe('trade stats', () => {
  it('netPnl sums all trades', () => {
    expect(netPnl(trades)).toBe(225)
    expect(netPnl([])).toBe(0)
  })

  it('winRate: wins / total, breakeven counts as non-win', () => {
    expect(winRate(trades)).toBe(2 / 5)
    expect(winRate([])).toBe(0)
  })

  it('profitFactor: gross wins / abs(gross losses)', () => {
    expect(profitFactor(trades)).toBeCloseTo(300 / 75, 5)
    expect(profitFactor([{ pnl: 100 }])).toBe(Infinity)
    expect(profitFactor([{ pnl: 0 }])).toBe(0)
    expect(profitFactor([])).toBe(0)
  })

  it('avgWin / avgLoss', () => {
    expect(avgWin(trades)).toBe(150)
    expect(avgLoss(trades)).toBe(-37.5)
    expect(avgWin([])).toBe(0)
    expect(avgLoss([])).toBe(0)
  })

  it('dayWinRate: % of net-positive days', () => {
    expect(dayWinRate([100, -50, 200, 0])).toBe(0.5)
    expect(dayWinRate([])).toBe(0)
  })

  it('tradeDurationMinutes', () => {
    expect(tradeDurationMinutes('2026-07-05T09:30:00', '2026-07-05T09:45:00')).toBe(15)
    expect(tradeDurationMinutes('2026-07-05T09:30:00', '2026-07-05T11:30:00')).toBe(120)
  })

  const durationTrades = [
    { pnl: 100, entryTime: '2026-07-05T09:00:00', exitTime: '2026-07-05T09:10:00' }, // win, 10m
    { pnl: -50, entryTime: '2026-07-05T10:00:00', exitTime: '2026-07-05T10:30:00' }, // loss, 30m
  ]

  it('avgTradeDurationMinutes / avgWinDurationMinutes / avgLossDurationMinutes', () => {
    expect(avgTradeDurationMinutes(durationTrades)).toBe(20)
    expect(avgWinDurationMinutes(durationTrades)).toBe(10)
    expect(avgLossDurationMinutes(durationTrades)).toBe(30)
    expect(avgTradeDurationMinutes([])).toBe(0)
    expect(avgWinDurationMinutes([])).toBe(0)
  })

  it('totalLotsTraded sums qty across trades', () => {
    expect(totalLotsTraded([{ qty: 1 }, { qty: 2.5 }, { qty: 0.5 }])).toBe(4)
    expect(totalLotsTraded([])).toBe(0)
  })

  it('longPct: fraction of trades taken long', () => {
    expect(longPct([{ side: 'long' }, { side: 'long' }, { side: 'short' }])).toBeCloseTo(2 / 3, 5)
    expect(longPct([])).toBe(0)
  })

  it('bestTrade / worstTrade return the extreme trade, or null when empty', () => {
    const withSymbols = [{ pnl: 100, symbol: 'ES' }, { pnl: -50, symbol: 'NQ' }, { pnl: 200, symbol: 'MES' }]
    expect(bestTrade(withSymbols)).toMatchObject({ pnl: 200, symbol: 'MES' })
    expect(worstTrade(withSymbols)).toMatchObject({ pnl: -50, symbol: 'NQ' })
    expect(bestTrade([])).toBeNull()
    expect(worstTrade([])).toBeNull()
  })
})
