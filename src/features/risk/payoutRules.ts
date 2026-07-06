import type { PayoutRuleProfile } from '../../types'

export interface PayoutInput {
  payoutNumber: number // 1-based: the payout being requested
  balance: number
  tradingDaysSinceLast: number
  profitableDays: number // days with >= profile.profitableDayMin profit
  biggestDayProfit: number // biggest single-day profit since last approved payout
  totalProfitSinceLastPayout: number
}

export interface PayoutCheck {
  ok: boolean
  reasons: string[]
  maxRequestable: number
  minProfitNeededForWindfall: number
}

/** Generic payout-gate check, parameterized by a per-account rule profile instead of a hardcoded firm constant. */
export function checkPayout(profile: PayoutRuleProfile, p: PayoutInput): PayoutCheck {
  const reasons: string[] = []

  if (p.tradingDaysSinceLast < profile.tradingDaysBetween)
    reasons.push(`Need ${profile.tradingDaysBetween} trading days (have ${p.tradingDaysSinceLast})`)

  if (p.profitableDays < profile.profitableDaysRequired)
    reasons.push(`Need ${profile.profitableDaysRequired} days with $${profile.profitableDayMin}+ profit (have ${p.profitableDays})`)

  const safetyNetActive =
    profile.safetyNetBalance !== undefined &&
    (profile.safetyNetPayoutCount === undefined || p.payoutNumber <= profile.safetyNetPayoutCount)
  if (safetyNetActive && p.balance < profile.safetyNetBalance!)
    reasons.push(`Safety net: balance must be >= $${profile.safetyNetBalance!.toLocaleString()} (at $${p.balance.toLocaleString()})`)

  let minProfitNeededForWindfall = 0
  const windfallActive =
    profile.windfallShare !== undefined &&
    (profile.windfallAppliesToPayoutCount === undefined || p.payoutNumber <= profile.windfallAppliesToPayoutCount)
  if (windfallActive) {
    minProfitNeededForWindfall = p.biggestDayProfit / profile.windfallShare!
    if (p.totalProfitSinceLastPayout < minProfitNeededForWindfall)
      reasons.push(
        `Windfall rule: need $${Math.ceil(minProfitNeededForWindfall).toLocaleString()} total profit (have $${p.totalProfitSinceLastPayout.toLocaleString()})`,
      )
  }

  const minPayout = profile.minPayout ?? 0
  const headroom =
    profile.safetyNetBalance !== undefined
      ? Math.max(0, p.balance - profile.safetyNetBalance + minPayout)
      : Math.max(0, p.balance)

  const capActive = profile.capFirstNPayouts && p.payoutNumber <= profile.capFirstNPayouts.count
  const maxRequestable = capActive ? Math.min(profile.capFirstNPayouts!.cap, headroom) : headroom

  return { ok: reasons.length === 0, reasons, maxRequestable, minProfitNeededForWindfall }
}

/** Turn a window of session P&Ls (since the last payout) into checkPayout's input fields. */
export function payoutProgress(
  profile: PayoutRuleProfile,
  sessionsSinceLastPayout: { pnl: number }[],
): { tradingDaysSinceLast: number; profitableDays: number; biggestDayProfit: number; totalProfitSinceLastPayout: number } {
  return {
    tradingDaysSinceLast: sessionsSinceLastPayout.length,
    profitableDays: sessionsSinceLastPayout.filter((s) => s.pnl >= profile.profitableDayMin).length,
    biggestDayProfit: sessionsSinceLastPayout.reduce((max, s) => Math.max(max, s.pnl), 0),
    totalProfitSinceLastPayout: sessionsSinceLastPayout.reduce((sum, s) => sum + s.pnl, 0),
  }
}

/** Generic profit split: 100% up to splitFullUpTo (if set), splitAfter share beyond that. */
export function traderShare(profile: PayoutRuleProfile, cumulativePaidSoFar: number, amount: number): number {
  const fullUpTo = profile.splitFullUpTo ?? 0
  const fullLeft = Math.max(0, fullUpTo - cumulativePaidSoFar)
  const at100 = Math.min(amount, fullLeft)
  return at100 + (amount - at100) * profile.splitAfter
}
