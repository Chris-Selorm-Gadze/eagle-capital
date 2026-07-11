import { supabase } from '../lib/supabaseClient'
import type { Trade } from '../types'

export type TradeInput = Omit<Trade, 'id' | 'pnl' | 'date'>

function computePnl(input: TradeInput): number {
  const dir = input.side === 'long' ? 1 : -1
  return (input.exitPrice - input.entryPrice) * input.qty * dir - (input.fees ?? 0)
}

export function fromRow(row: Record<string, any>): Trade {
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.date,
    symbol: row.symbol,
    side: row.side,
    qty: Number(row.qty),
    entryPrice: Number(row.entry_price),
    exitPrice: Number(row.exit_price),
    entryTime: row.entry_time,
    exitTime: row.exit_time,
    fees: row.fees !== null ? Number(row.fees) : undefined,
    pnl: Number(row.pnl),
    notes: row.notes ?? undefined,
    stopLoss: row.stop_loss !== null ? Number(row.stop_loss) : undefined,
    profitTarget: row.profit_target !== null ? Number(row.profit_target) : undefined,
    rating: row.rating ?? undefined,
    tags: row.tags ?? undefined,
  }
}

// `pnlOverride` lets a caller that already knows the true P&L (CSV import, where the broker's own
// Profit column is authoritative) preserve it exactly. Our price-diff formula only assumes 1 unit
// of qty = $1/point, which isn't true for every instrument's real contract multiplier (e.g. an
// index CFD worth $10/point/lot) — recomputing it for imported trades silently corrupts the P&L.
// Manual entry (AddTradeDialog) has no such authoritative source, so it still gets computed.
export function toRow(t: TradeInput, pnlOverride?: number): Record<string, unknown> {
  return {
    account_id: t.accountId,
    symbol: t.symbol,
    side: t.side,
    qty: t.qty,
    entry_price: t.entryPrice,
    exit_price: t.exitPrice,
    entry_time: t.entryTime,
    exit_time: t.exitTime,
    fees: t.fees,
    notes: t.notes,
    // Bare passthrough (not `?? null`) is deliberate: updateTrade always sends this whole object
    // through .update(), and a bare `undefined` is dropped by JSON.stringify before the request
    // body is built, leaving that column untouched server-side instead of nulling it out — so
    // AddTradeDialog, which knows nothing about these journal fields, can never wipe them.
    stop_loss: t.stopLoss,
    profit_target: t.profitTarget,
    rating: t.rating,
    tags: t.tags,
    date: t.entryTime.slice(0, 10),
    pnl: pnlOverride ?? computePnl(t),
  }
}

export async function listTrades(): Promise<Trade[]> {
  const { data, error } = await supabase.from('trades').select('*').order('date', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function addTrade(userId: string, input: TradeInput): Promise<void> {
  const { error } = await supabase.from('trades').insert({ user_id: userId, ...toRow(input) })
  if (error) throw error
}

// `pnlOverride` mirrors toRow's — callers that aren't touching entry/exit/qty/side/fees
// (e.g. the Trade Journal's Save, which only edits notes/tags/rating/stop-loss/target)
// must pass the trade's existing pnl through unchanged, or this would silently recompute
// it via the naive price-diff formula and re-corrupt an authoritative CSV-imported value.
export async function updateTrade(id: string, input: TradeInput, pnlOverride?: number): Promise<void> {
  const { error } = await supabase.from('trades').update(toRow(input, pnlOverride)).eq('id', id)
  if (error) throw error
}

export async function deleteTrade(id: string): Promise<void> {
  const { error } = await supabase.from('trades').delete().eq('id', id)
  if (error) throw error
}

export async function deleteTrades(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('trades').delete().in('id', ids)
  if (error) throw error
}

export type ImportedTrade = Omit<Trade, 'id' | 'date' | 'accountId'>

// Timestamps are compared by epoch millisecond, not raw string, because Postgres/PostgREST
// serializes timestamptz differently (e.g. "+00:00", trailing zeros) than the ISO strings
// produced when parsing a CSV (toISOString()'s "Z" form) — comparing the strings directly
// meant identical moments in time never matched, so re-importing the same CSV silently
// inserted duplicates instead of being skipped.
export function importKey(t: Pick<Trade, 'symbol' | 'entryTime' | 'exitTime' | 'entryPrice' | 'exitPrice'>): string {
  return `${t.symbol}|${new Date(t.entryTime).getTime()}|${new Date(t.exitTime).getTime()}|${t.entryPrice}|${t.exitPrice}`
}

/** Bulk-inserts imported trades, skipping any that match an existing trade on this
 * account by symbol+entry/exit time+price — lets the same CSV be re-imported safely. */
export async function importTrades(userId: string, accountId: string, parsed: ImportedTrade[]): Promise<{ imported: number; skipped: number }> {
  const { data: existingRows, error } = await supabase
    .from('trades')
    .select('symbol, entry_time, exit_time, entry_price, exit_price')
    .eq('account_id', accountId)
  if (error) throw error

  const seenKeys = new Set(
    (existingRows ?? []).map((r) =>
      importKey({ symbol: r.symbol, entryTime: r.entry_time, exitTime: r.exit_time, entryPrice: Number(r.entry_price), exitPrice: Number(r.exit_price) }),
    ),
  )

  const rows: Record<string, unknown>[] = []
  let skipped = 0
  for (const t of parsed) {
    const key = importKey(t)
    if (seenKeys.has(key)) {
      skipped++
      continue
    }
    seenKeys.add(key)
    rows.push({ user_id: userId, ...toRow({ ...t, accountId }, t.pnl) })
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('trades').insert(rows)
    if (insertError) throw insertError
  }
  return { imported: rows.length, skipped }
}
