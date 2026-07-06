// FundedNext CFD (Stellar) rules.
// Source: help.fundednext.com/en/articles/8019659 (Scale-Up) - verified Jul 2026

export type FnModel = 'stellar-1step' | 'stellar-2step' | 'stellar-lite'

export const FN = {
  allocationCap: 300_000, // combined base cap across Stellar funded accounts
  split: 0.8,
  proSplit: 0.9,
  challengeReward: 0.15, // retroactive 15% of challenge profit target
  newsProfitCredit: 0.4, // profit credit for trades within 5 min of high-impact news
} as const

export const FN_DD: Record<FnModel, { daily: number; max: number }> = {
  'stellar-1step': { daily: 0.03, max: 0.06 },
  'stellar-2step': { daily: 0.05, max: 0.1 },
  'stellar-lite': { daily: 0.04, max: 0.08 },
}

export function ddLimits(model: FnModel, size: number) {
  const dd = FN_DD[model]
  return { dailyLoss: size * dd.daily, maxLoss: size * dd.max }
}

/** Base (unscaled) allocation counts against the $300K cap. */
export function capRemaining(baseSizes: number[]): number {
  return FN.allocationCap - baseSizes.reduce((a, b) => a + b, 0)
}

/** News rule: only 40% of profit counts if opened/closed within 5 min of high-impact news; losses count fully. */
export function newsAdjustedProfit(profit: number, withinNewsWindow: boolean): number {
  return withinNewsWindow && profit > 0 ? profit * FN.newsProfitCredit : profit
}
