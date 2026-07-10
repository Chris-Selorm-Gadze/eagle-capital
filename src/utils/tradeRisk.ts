// Planned-risk / R-multiple math for the Trade Journal. Pure, descriptive stats computed from
// user-entered numbers — not firm-rule enforcement, same category as utils/tradeStats.ts.

export interface RiskInput {
  entryPrice: number
  stopLoss?: number
  qty: number
  side: 'long' | 'short'
}

export interface TargetInput {
  entryPrice: number
  profitTarget?: number
  qty: number
  side: 'long' | 'short'
}

export interface PlannedRInput {
  entryPrice: number
  stopLoss?: number
  profitTarget?: number
  side: 'long' | 'short'
}

export interface RealizedRInput {
  entryPrice: number
  stopLoss?: number
  exitPrice: number
  side: 'long' | 'short'
}

function riskPerUnit(entryPrice: number, stopLoss: number, side: 'long' | 'short'): number {
  return side === 'long' ? entryPrice - stopLoss : stopLoss - entryPrice
}

function rewardPerUnit(entryPrice: number, target: number, side: 'long' | 'short'): number {
  return side === 'long' ? target - entryPrice : entryPrice - target
}

/** Dollar risk implied by the planned stop-loss. Null if no stop-loss is set. */
export function tradeRiskDollars({ entryPrice, stopLoss, qty, side }: RiskInput): number | null {
  if (stopLoss === undefined) return null
  return riskPerUnit(entryPrice, stopLoss, side) * qty
}

/** Dollar reward implied by the planned profit target. Null if no target is set. */
export function initialTargetDollars({ entryPrice, profitTarget, qty, side }: TargetInput): number | null {
  if (profitTarget === undefined) return null
  return rewardPerUnit(entryPrice, profitTarget, side) * qty
}

/** Planned reward-to-risk ratio. Null if stop-loss or target is missing, or risk is zero. */
export function plannedRMultiple({ entryPrice, stopLoss, profitTarget, side }: PlannedRInput): number | null {
  if (stopLoss === undefined || profitTarget === undefined) return null
  const risk = riskPerUnit(entryPrice, stopLoss, side)
  if (risk === 0) return null
  return rewardPerUnit(entryPrice, profitTarget, side) / risk
}

/** How many multiples of the planned risk the trade actually realized. Null if no stop-loss is set. */
export function realizedRMultiple({ entryPrice, stopLoss, exitPrice, side }: RealizedRInput): number | null {
  if (stopLoss === undefined) return null
  const risk = riskPerUnit(entryPrice, stopLoss, side)
  if (risk === 0) return null
  return rewardPerUnit(entryPrice, exitPrice, side) / risk
}
