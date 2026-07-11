import type { PlaybookExample, Trade } from '../../types'
import { netPnl, winRate } from '../../utils/tradeStats'
import { realizedRMultiple } from '../../utils/tradeRisk'

export interface PlaybookStats {
  tradeCount: number
  winRatePct: number | null
  netPnl: number | null
  minR: number | null
  maxR: number | null
}

export function playbookLinkedTrades(playbookId: string, examples: PlaybookExample[], trades: Trade[]): Trade[] {
  const tradeIds = new Set(examples.filter((e) => e.playbookId === playbookId && e.tradeId).map((e) => e.tradeId))
  return trades.filter((t) => t.id && tradeIds.has(t.id))
}

export function computePlaybookStats(linkedTrades: Trade[]): PlaybookStats {
  if (linkedTrades.length === 0) {
    return { tradeCount: 0, winRatePct: null, netPnl: null, minR: null, maxR: null }
  }
  const rValues = linkedTrades
    .map((t) => realizedRMultiple({ entryPrice: t.entryPrice, stopLoss: t.stopLoss, exitPrice: t.exitPrice, side: t.side }))
    .filter((r): r is number => r !== null)

  return {
    tradeCount: linkedTrades.length,
    winRatePct: winRate(linkedTrades) * 100,
    netPnl: netPnl(linkedTrades),
    minR: rValues.length ? Math.min(...rValues) : null,
    maxR: rValues.length ? Math.max(...rValues) : null,
  }
}
