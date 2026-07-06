import { describe, it, expect } from 'vitest'
import { ddLimits, capRemaining, newsAdjustedProfit } from '../fundednext'

describe('fundednext', () => {
  it('dd limits by model', () => {
    expect(ddLimits('stellar-1step', 15_000)).toEqual({ dailyLoss: 450, maxLoss: 900 })
    expect(ddLimits('stellar-2step', 5_000)).toEqual({ dailyLoss: 250, maxLoss: 500 })
  })
  it('base allocation cap 300k', () => {
    expect(capRemaining([20_000, 25_000, 50_000, 100_000])).toBe(105_000)
  })
  it('news rule credits 40% of profit, 100% of losses', () => {
    expect(newsAdjustedProfit(1_000, true)).toBe(400)
    expect(newsAdjustedProfit(-1_000, true)).toBe(-1_000)
    expect(newsAdjustedProfit(1_000, false)).toBe(1_000)
  })
})
