import { describe, it, expect } from 'vitest'
import { ddLimits, capRemaining, proEligible, scaledSize, newsAdjustedProfit } from '../fundednext'

describe('fundednext', () => {
  it('dd limits by model', () => {
    expect(ddLimits('stellar-1step', 15_000)).toEqual({ dailyLoss: 450, maxLoss: 900 })
    expect(ddLimits('stellar-2step', 5_000)).toEqual({ dailyLoss: 250, maxLoss: 500 })
  })
  it('base allocation cap 300k', () => {
    expect(capRemaining([20_000, 25_000, 50_000, 100_000])).toBe(105_000)
  })
  it('pro eligibility needs 61 days AND 4 qualifying cycles', () => {
    const funded = new Date('2026-07-20')
    expect(proEligible(funded, 4, new Date('2026-09-01'))).toBe(false) // too young
    expect(proEligible(funded, 3, new Date('2026-10-01'))).toBe(false) // cycles short
    expect(proEligible(funded, 4, new Date('2026-09-20'))).toBe(true)
  })
  it('scale events compound 25%, capped at 4M', () => {
    expect(scaledSize(15_000, 1)).toBe(18_750)
    expect(scaledSize(300_000, 4)).toBeCloseTo(732_421.875, 3)
    expect(scaledSize(4_000_000, 2)).toBe(4_000_000)
  })
  it('news rule credits 40% of profit, 100% of losses', () => {
    expect(newsAdjustedProfit(1_000, true)).toBe(400)
    expect(newsAdjustedProfit(-1_000, true)).toBe(-1_000)
    expect(newsAdjustedProfit(1_000, false)).toBe(1_000)
  })
})
