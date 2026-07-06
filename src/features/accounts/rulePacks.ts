import type { PayoutRuleProfile, ScalingRuleProfile } from '../../types'

// Source: apextraderfunding.com/help-center/legacy-payouts/legacy-pa-payout-parameters/ (verified Jul 2026)
export const APEX_PAYOUT_RULE_PROFILE: PayoutRuleProfile = {
  tradingDaysBetween: 8,
  profitableDaysRequired: 5,
  profitableDayMin: 50,
  safetyNetBalance: 256_600, // start + drawdown + $100 (first 3 payouts)
  safetyNetPayoutCount: 3,
  windfallShare: 0.3, // no single day > 30% of profit balance, until 6th payout
  windfallAppliesToPayoutCount: 5,
  minPayout: 500,
  capFirstNPayouts: { count: 5, cap: 3_000 },
  splitFullUpTo: 25_000, // 100% of first $25K per account
  splitAfter: 0.9,
}

// Source: help.fundednext.com/en/articles/13349186-fundednext-pro-the-scale-up-program (verified Jul 2026)
export const FN_SCALING_RULE_PROFILE: ScalingRuleProfile = {
  cyclesRequired: 4, // performance rewards with >= 4% growth each
  minCycleGrowthPct: 0.04,
  minAgeDays: 61, // "2 months" account age
  scaleRatePct: 0.25, // +25% per qualifying cycle
  scaleCeiling: 4_000_000,
}

export const PAYOUT_RULE_PACKS: Record<string, PayoutRuleProfile> = {
  apex: APEX_PAYOUT_RULE_PROFILE,
}

export const SCALING_RULE_PACKS: Record<string, ScalingRuleProfile> = {
  fundednext: FN_SCALING_RULE_PROFILE,
}
