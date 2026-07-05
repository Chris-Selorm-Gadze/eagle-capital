import { db, type Trade } from './schema'

export type TradeInput = Omit<Trade, 'id' | 'pnl' | 'date'>

function computePnl(input: TradeInput): number {
  const dir = input.side === 'long' ? 1 : -1
  return (input.exitPrice - input.entryPrice) * input.qty * dir - (input.fees ?? 0)
}

export async function addTrade(input: TradeInput) {
  await db.trades.add({
    ...input,
    date: input.entryTime.slice(0, 10),
    pnl: computePnl(input),
  })
}

export async function updateTrade(id: number, input: TradeInput) {
  await db.trades.update(id, {
    ...input,
    date: input.entryTime.slice(0, 10),
    pnl: computePnl(input),
  })
}

export async function deleteTrade(id: number) {
  await db.trades.delete(id)
}

export type ImportedTrade = Omit<Trade, 'id' | 'date' | 'accountId'>

function importKey(t: Pick<Trade, 'symbol' | 'entryTime' | 'exitTime' | 'entryPrice' | 'exitPrice'>): string {
  return `${t.symbol}|${t.entryTime}|${t.exitTime}|${t.entryPrice}|${t.exitPrice}`
}

/** Bulk-inserts imported trades, skipping any that match an existing trade on this
 * account by symbol+entry/exit time+price — lets the same CSV be re-imported safely. */
export async function importTrades(accountId: number, parsed: ImportedTrade[]): Promise<{ imported: number; skipped: number }> {
  const existing = await db.trades.where('accountId').equals(accountId).toArray()
  const seenKeys = new Set(existing.map(importKey))

  const rows: Trade[] = []
  let skipped = 0
  for (const t of parsed) {
    const key = importKey(t)
    if (seenKeys.has(key)) {
      skipped++
      continue
    }
    seenKeys.add(key)
    rows.push({ ...t, accountId, date: t.entryTime.slice(0, 10) })
  }

  if (rows.length > 0) await db.trades.bulkAdd(rows)
  return { imported: rows.length, skipped }
}
