import { describe, it, expect } from 'vitest'
import {
  trailThreshold, roomToTrail, checkPayout, traderShare,
  profitToTarget, profitToPayoutMin, payoutProgress,
} from '../apex'

describe('apex trail', () => {
  it('trails 6500 behind highest balance', () => {
    expect(trailThreshold(250_000, 'evaluation')).toBe(243_500)
    expect(trailThreshold(258_000, 'evaluation')).toBe(251_500)
  })
  it('rithmic eval trail caps at 265,000', () => {
    expect(trailThreshold(280_000, 'evaluation', 'rithmic')).toBe(265_000)
  })
  it('tradovate eval trail never caps', () => {
    expect(trailThreshold(280_000, 'evaluation', 'tradovate')).toBe(273_500)
  })
  it('PA trail caps at 250,100', () => {
    expect(trailThreshold(270_000, 'pa')).toBe(250_100)
  })
  it('room to trail uses highest, not current, balance', () => {
    // peaked at 258k unrealized, closed back at 252k -> only $500 of room left
    expect(roomToTrail(252_000, 258_000, 'evaluation')).toBe(500)
  })
})

describe('apex payout checks', () => {
  const base = {
    payoutNumber: 1, balance: 257_000, tradingDaysSinceLast: 8,
    profitableDays50: 5, biggestDayProfit: 1_500, totalProfitSinceLastPayout: 7_000,
  }
  it('passes when all gates met', () => {
    expect(checkPayout(base).ok).toBe(true)
  })
  it('fails below safety net balance on first 3 payouts', () => {
    const r = checkPayout({ ...base, balance: 256_000 })
    expect(r.ok).toBe(false)
  })
  it('safety net not required from 4th payout', () => {
    expect(checkPayout({ ...base, payoutNumber: 4, balance: 256_000 }).reasons
      .some(s => s.includes('Safety net'))).toBe(false)
  })
  it('windfall: 1500 biggest day needs 5000 total profit', () => {
    const r = checkPayout({ ...base, biggestDayProfit: 1_500, totalProfitSinceLastPayout: 4_000 })
    expect(r.ok).toBe(false)
    expect(r.minProfitNeededForWindfall).toBe(5_000)
  })
  it('caps at 3000 for first five payouts, uncapped after', () => {
    // balance 257,000 only clears the safety net by $400 -> $900 max ($500 min + $400 excess)
    expect(checkPayout(base).maxRequestable).toBe(900)
    expect(checkPayout({ ...base, balance: 260_000 }).maxRequestable).toBe(3_000)
    expect(checkPayout({ ...base, payoutNumber: 6, balance: 270_000 }).maxRequestable).toBe(13_900)
  })
})

describe('apex split', () => {
  it('100% of first 25k, 90% after', () => {
    expect(traderShare(0, 10_000)).toBe(10_000)
    expect(traderShare(24_000, 2_000)).toBe(1_000 + 1_000 * 0.9)
    expect(traderShare(30_000, 1_000)).toBe(900)
  })
})

describe('apex payout progress from sessions', () => {
  it('aggregates trading days, $50+ days, biggest day, and total profit', () => {
    const sessions = [{ pnl: 100 }, { pnl: 60 }, { pnl: -30 }, { pnl: 2_000 }, { pnl: 40 }, { pnl: 70 }]
    expect(payoutProgress(sessions)).toEqual({
      tradingDaysSinceLast: 6,
      profitableDays50: 4,
      biggestDayProfit: 2_000,
      totalProfitSinceLastPayout: 2_240,
    })
  })
  it('empty window', () => {
    expect(payoutProgress([])).toEqual({
      tradingDaysSinceLast: 0, profitableDays50: 0, biggestDayProfit: 0, totalProfitSinceLastPayout: 0,
    })
  })
})

describe('apex cushions', () => {
  it('profit to target: 15k needed at start, 0 once past 265k', () => {
    expect(profitToTarget(250_000)).toBe(15_000)
    expect(profitToTarget(260_000)).toBe(5_000)
    expect(profitToTarget(265_000)).toBe(0)
    expect(profitToTarget(270_000)).toBe(0)
  })
  it('profit to payout min: 256,600 safety net', () => {
    expect(profitToPayoutMin(256_000)).toBe(600)
    expect(profitToPayoutMin(256_600)).toBe(0)
    expect(profitToPayoutMin(257_000)).toBe(0)
  })
})
