// Standard trading-performance metric definitions. Not firm rules, but kept
// out of the UI and tested the same way, per the golden rule in CLAUDE.md.

export interface TradeResult {
  pnl: number
}

export function netPnl(trades: TradeResult[]): number {
  return trades.reduce((sum, t) => sum + t.pnl, 0)
}

/** Wins / total trades. Breakeven (pnl === 0) counts as a non-win, still in the denominator. */
export function winRate(trades: TradeResult[]): number {
  if (trades.length === 0) return 0
  return trades.filter((t) => t.pnl > 0).length / trades.length
}

export interface GrossWinLoss {
  grossWins: number
  grossLosses: number // positive magnitude
}

export function grossWinLoss(trades: TradeResult[]): GrossWinLoss {
  const grossWins = trades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0)
  const grossLosses = Math.abs(trades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0))
  return { grossWins, grossLosses }
}

/** Gross wins / abs(gross losses). No losses -> Infinity if there are wins, else 0. */
export function profitFactor(trades: TradeResult[]): number {
  const { grossWins, grossLosses } = grossWinLoss(trades)
  if (grossLosses === 0) return grossWins > 0 ? Infinity : 0
  return grossWins / grossLosses
}

export interface OutcomeCounts {
  wins: number
  breakeven: number
  losses: number
}

export function tradeOutcome(pnl: number): 'win' | 'loss' | 'breakeven' {
  if (pnl > 0) return 'win'
  if (pnl < 0) return 'loss'
  return 'breakeven'
}

export function outcomeCounts(trades: TradeResult[]): OutcomeCounts {
  let wins = 0, breakeven = 0, losses = 0
  for (const t of trades) {
    const outcome = tradeOutcome(t.pnl)
    if (outcome === 'win') wins++
    else if (outcome === 'loss') losses++
    else breakeven++
  }
  return { wins, breakeven, losses }
}

export function avgWin(trades: TradeResult[]): number {
  const wins = trades.filter((t) => t.pnl > 0)
  return wins.length === 0 ? 0 : wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length
}

export function avgLoss(trades: TradeResult[]): number {
  const losses = trades.filter((t) => t.pnl < 0)
  return losses.length === 0 ? 0 : losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length
}

/** % of days with a net-positive total across all trades that day. */
export function dayWinRate(dailyPnls: number[]): number {
  if (dailyPnls.length === 0) return 0
  return dailyPnls.filter((p) => p > 0).length / dailyPnls.length
}

export function tradeDurationMinutes(entryTime: string, exitTime: string): number {
  return (new Date(exitTime).getTime() - new Date(entryTime).getTime()) / 60_000
}

export interface TradeWithDuration extends TradeResult {
  entryTime: string
  exitTime: string
}

export function avgTradeDurationMinutes(trades: TradeWithDuration[]): number {
  if (trades.length === 0) return 0
  const total = trades.reduce((sum, t) => sum + tradeDurationMinutes(t.entryTime, t.exitTime), 0)
  return total / trades.length
}

export function avgWinDurationMinutes(trades: TradeWithDuration[]): number {
  return avgTradeDurationMinutes(trades.filter((t) => t.pnl > 0))
}

export function avgLossDurationMinutes(trades: TradeWithDuration[]): number {
  return avgTradeDurationMinutes(trades.filter((t) => t.pnl < 0))
}

export function totalLotsTraded(trades: { qty: number }[]): number {
  return trades.reduce((sum, t) => sum + t.qty, 0)
}

/** % of trades taken long (vs short). */
export function longPct(trades: { side: 'long' | 'short' }[]): number {
  if (trades.length === 0) return 0
  return trades.filter((t) => t.side === 'long').length / trades.length
}

export function bestTrade<T extends TradeResult>(trades: T[]): T | null {
  return trades.length === 0 ? null : trades.reduce((best, t) => (t.pnl > best.pnl ? t : best))
}

export function worstTrade<T extends TradeResult>(trades: T[]): T | null {
  return trades.length === 0 ? null : trades.reduce((worst, t) => (t.pnl < worst.pnl ? t : worst))
}
