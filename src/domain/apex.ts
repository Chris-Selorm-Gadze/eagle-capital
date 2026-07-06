// Apex Trader Funding - LEGACY 250K rules.
// Source: apextraderfunding.com/help-center/evaluation-accounts-ea/legacy-evaluation-rules/ (verified Jul 2026)

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
