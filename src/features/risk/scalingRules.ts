import type { ScalingRuleProfile } from '../../types'

export function qualifyingCyclesCount(profile: ScalingRuleProfile, rewards: { growthPct: number }[]): number {
  return rewards.filter((r) => r.growthPct >= profile.minCycleGrowthPct).length
}

export function scalingEligible(
  profile: ScalingRuleProfile,
  fundedDate: Date,
  qualifyingCycles: number,
  now: Date,
): boolean {
  const ageDays = (now.getTime() - fundedDate.getTime()) / 86_400_000
  return ageDays >= profile.minAgeDays && qualifyingCycles >= profile.cyclesRequired
}

export function scaledSize(profile: ScalingRuleProfile, base: number, scaleEvents: number): number {
  const scaled = base * Math.pow(1 + profile.scaleRatePct, scaleEvents)
  return profile.scaleCeiling !== undefined ? Math.min(scaled, profile.scaleCeiling) : scaled
}
