import { describe, it, expect } from 'vitest'
import { checkPayout, payoutProgress, traderShare } from './payoutRules'
import { APEX_PAYOUT_RULE_PROFILE } from '../accounts/rulePacks'

describe('apex rule pack: payout checks', () => {
  const profile = APEX_PAYOUT_RULE_PROFILE
  const base = {
    payoutNumber: 1, balance: 257_000, tradingDaysSinceLast: 8,
    profitableDays: 5, biggestDayProfit: 1_500, totalProfitSinceLastPayout: 7_000,
  }
  it('passes when all gates met', () => {
    expect(checkPayout(profile, base).ok).toBe(true)
  })
  it('fails below safety net balance on first 3 payouts', () => {
    const r = checkPayout(profile, { ...base, balance: 256_000 })
    expect(r.ok).toBe(false)
  })
  it('safety net not required from 4th payout', () => {
    expect(checkPayout(profile, { ...base, payoutNumber: 4, balance: 256_000 }).reasons
      .some(s => s.includes('Safety net'))).toBe(false)
  })
  it('windfall: 1500 biggest day needs 5000 total profit', () => {
    const r = checkPayout(profile, { ...base, biggestDayProfit: 1_500, totalProfitSinceLastPayout: 4_000 })
    expect(r.ok).toBe(false)
    expect(r.minProfitNeededForWindfall).toBe(5_000)
  })
  it('caps at 3000 for first five payouts, uncapped after', () => {
    // balance 257,000 only clears the safety net by $400 -> $900 max ($500 min + $400 excess)
    expect(checkPayout(profile, base).maxRequestable).toBe(900)
    expect(checkPayout(profile, { ...base, balance: 260_000 }).maxRequestable).toBe(3_000)
    expect(checkPayout(profile, { ...base, payoutNumber: 6, balance: 270_000 }).maxRequestable).toBe(13_900)
  })
})

describe('apex rule pack: split', () => {
  const profile = APEX_PAYOUT_RULE_PROFILE
  it('100% of first 25k, 90% after', () => {
    expect(traderShare(profile, 0, 10_000)).toBe(10_000)
    expect(traderShare(profile, 24_000, 2_000)).toBe(1_000 + 1_000 * 0.9)
    expect(traderShare(profile, 30_000, 1_000)).toBe(900)
  })
})

describe('payout progress from sessions', () => {
  const profile = APEX_PAYOUT_RULE_PROFILE
  it('aggregates trading days, threshold days, biggest day, and total profit', () => {
    const sessions = [{ pnl: 100 }, { pnl: 60 }, { pnl: -30 }, { pnl: 2_000 }, { pnl: 40 }, { pnl: 70 }]
    expect(payoutProgress(profile, sessions)).toEqual({
      tradingDaysSinceLast: 6,
      profitableDays: 4,
      biggestDayProfit: 2_000,
      totalProfitSinceLastPayout: 2_240,
    })
  })
  it('empty window', () => {
    expect(payoutProgress(profile, [])).toEqual({
      tradingDaysSinceLast: 0, profitableDays: 0, biggestDayProfit: 0, totalProfitSinceLastPayout: 0,
    })
  })
})

describe('generic profile without safety net or windfall', () => {
  it('skips gates that are not configured', () => {
    const minimal = { tradingDaysBetween: 5, profitableDaysRequired: 3, profitableDayMin: 100, splitAfter: 1 }
    const r = checkPayout(minimal, {
      payoutNumber: 1, balance: 1_000, tradingDaysSinceLast: 5, profitableDays: 3,
      biggestDayProfit: 500, totalProfitSinceLastPayout: 500,
    })
    expect(r.ok).toBe(true)
    expect(r.maxRequestable).toBe(1_000)
  })
})
