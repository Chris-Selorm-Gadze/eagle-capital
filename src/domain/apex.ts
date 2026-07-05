// Apex Trader Funding - LEGACY 250K rules.
// Source: apextraderfunding.com/help-center/evaluation-accounts-ea/legacy-evaluation-rules/ (verified Jul 2026)
// Source: apextraderfunding.com/help-center/legacy-payouts/legacy-pa-payout-parameters/ (verified Jul 2026)

export const APEX_250K = {
  size: 250_000,
  target: 15_000,
  trailingDD: 6_500,
  maxContracts: 27,
  minTradingDays: 7,
} as const

export type ApexStage = 'evaluation' | 'pa'
export type ApexPlatform = 'rithmic' | 'tradovate'

/**
 * Trailing threshold trails $6,500 behind the HIGHEST balance reached,
 * including unrealized peaks during open trades.
 * - Rithmic eval: stops trailing once threshold reaches start + target ($265,000)
 * - PA: stops trailing at start + $100 ($250,100)
 * - Tradovate eval: never stops trailing
 */
export function trailThreshold(
  highestBalance: number,
  stage: ApexStage,
  platform: ApexPlatform = 'rithmic',
): number {
  const raw = highestBalance - APEX_250K.trailingDD
  const cap =
    stage === 'pa'
      ? APEX_250K.size + 100
      : platform === 'rithmic'
        ? APEX_250K.size + APEX_250K.target
        : Infinity
  return Math.min(raw, cap)
}

/** True remaining risk: balance minus liquidation threshold. */
export function roomToTrail(
  balance: number,
  highestBalance: number,
  stage: ApexStage,
  platform: ApexPlatform = 'rithmic',
): number {
  return balance - trailThreshold(highestBalance, stage, platform)
}

export const PA_PAYOUT = {
  minBalance: 256_600, // start + drawdown + $100 (safety net, first 3 payouts)
  minPayout: 500,
  maxPayoutFirst5: 3_000,
  tradingDaysBetween: 8,
  profitableDaysRequired: 5,
  profitableDayMin: 50,
  windfallShare: 0.3, // no single day > 30% of profit balance, until 6th payout
  safetyNetPayouts: 3,
  splitFullUpTo: 25_000, // 100% of first $25K per account
  splitAfter: 0.9,
} as const

export interface PayoutInput {
  payoutNumber: number // 1-based: the payout being requested
  balance: number
  tradingDaysSinceLast: number
  profitableDays50: number // days with >= $50 profit among those
  biggestDayProfit: number // biggest single-day profit since last approved payout
  totalProfitSinceLastPayout: number
}

export interface PayoutCheck {
  ok: boolean
  reasons: string[]
  maxRequestable: number
  minProfitNeededForWindfall: number
}

export function checkPayout(p: PayoutInput): PayoutCheck {
  const reasons: string[] = []
  if (p.tradingDaysSinceLast < PA_PAYOUT.tradingDaysBetween)
    reasons.push(`Need ${PA_PAYOUT.tradingDaysBetween} trading days (have ${p.tradingDaysSinceLast})`)
  if (p.profitableDays50 < PA_PAYOUT.profitableDaysRequired)
    reasons.push(`Need ${PA_PAYOUT.profitableDaysRequired} days with $50+ profit (have ${p.profitableDays50})`)
  if (p.payoutNumber <= PA_PAYOUT.safetyNetPayouts && p.balance < PA_PAYOUT.minBalance)
    reasons.push(`Safety net: balance must be >= $${PA_PAYOUT.minBalance.toLocaleString()} (at $${p.balance.toLocaleString()})`)
  const minProfitNeededForWindfall = p.biggestDayProfit / PA_PAYOUT.windfallShare
  if (p.payoutNumber <= 5 && p.totalProfitSinceLastPayout < minProfitNeededForWindfall)
    reasons.push(`30% windfall rule: need $${Math.ceil(minProfitNeededForWindfall).toLocaleString()} total profit (have $${p.totalProfitSinceLastPayout.toLocaleString()})`)
  const headroom = Math.max(0, p.balance - PA_PAYOUT.minBalance + PA_PAYOUT.minPayout)
  const maxRequestable =
    p.payoutNumber <= 5 ? Math.min(PA_PAYOUT.maxPayoutFirst5, headroom) : headroom
  return { ok: reasons.length === 0, reasons, maxRequestable, minProfitNeededForWindfall }
}

/** 100% of first $25K paid out per account, 90% after. */
export function traderShare(cumulativePaidSoFar: number, amount: number): number {
  const fullLeft = Math.max(0, PA_PAYOUT.splitFullUpTo - cumulativePaidSoFar)
  const at100 = Math.min(amount, fullLeft)
  return at100 + (amount - at100) * PA_PAYOUT.splitAfter
}

/** Profit still needed to hit the eval target ($15K on a 250K account). */
export function profitToTarget(balance: number): number {
  return Math.max(0, APEX_250K.size + APEX_250K.target - balance)
}

/** Profit still needed to clear the PA safety-net minimum balance. */
export function profitToPayoutMin(balance: number): number {
  return Math.max(0, PA_PAYOUT.minBalance - balance)
}
