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
  }
}

export function toRow(t: TradeInput): Record<string, unknown> {
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
    date: t.entryTime.slice(0, 10),
    pnl: computePnl(t),
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

export async function updateTrade(id: string, input: TradeInput): Promise<void> {
  const { error } = await supabase.from('trades').update(toRow(input)).eq('id', id)
  if (error) throw error
}

export async function deleteTrade(id: string): Promise<void> {
  const { error } = await supabase.from('trades').delete().eq('id', id)
  if (error) throw error
}

export type ImportedTrade = Omit<Trade, 'id' | 'date' | 'accountId'>

function importKey(t: Pick<Trade, 'symbol' | 'entryTime' | 'exitTime' | 'entryPrice' | 'exitPrice'>): string {
  return `${t.symbol}|${t.entryTime}|${t.exitTime}|${t.entryPrice}|${t.exitPrice}`
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
    rows.push({ user_id: userId, ...toRow({ ...t, accountId }) })
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('trades').insert(rows)
    if (insertError) throw insertError
  }
  return { imported: rows.length, skipped }
}
