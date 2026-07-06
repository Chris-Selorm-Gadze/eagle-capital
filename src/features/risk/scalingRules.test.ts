import { describe, it, expect } from 'vitest'
import { scalingEligible, scaledSize, qualifyingCyclesCount } from './scalingRules'
import { FN_SCALING_RULE_PROFILE } from '../accounts/rulePacks'

describe('fundednext rule pack: pro scaling', () => {
  const profile = FN_SCALING_RULE_PROFILE

  it('pro eligibility needs 61 days AND 4 qualifying cycles', () => {
    const funded = new Date('2026-07-20')
    expect(scalingEligible(profile, funded, 4, new Date('2026-09-01'))).toBe(false) // too young
    expect(scalingEligible(profile, funded, 3, new Date('2026-10-01'))).toBe(false) // cycles short
    expect(scalingEligible(profile, funded, 4, new Date('2026-09-20'))).toBe(true)
  })

  it('scale events compound 25%, capped at 4M', () => {
    expect(scaledSize(profile, 15_000, 1)).toBe(18_750)
    expect(scaledSize(profile, 300_000, 4)).toBeCloseTo(732_421.875, 3)
    expect(scaledSize(profile, 4_000_000, 2)).toBe(4_000_000)
  })

  it('counts rewards at or above the qualifying growth threshold', () => {
    const rewards = [{ growthPct: 0.05 }, { growthPct: 0.03 }, { growthPct: 0.04 }]
    expect(qualifyingCyclesCount(profile, rewards)).toBe(2)
  })
})

describe('generic profile without a scale ceiling', () => {
  it('scales unbounded', () => {
    const profile = { cyclesRequired: 1, minCycleGrowthPct: 0.05, minAgeDays: 0, scaleRatePct: 0.5 }
    expect(scaledSize(profile, 10_000, 3)).toBeCloseTo(33_750, 3)
  })
})
