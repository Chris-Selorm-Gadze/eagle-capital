import { supabase } from '../lib/supabaseClient'
import { selectAll } from './paginate'
import { todayTradingDay } from '../utils/tradingDay'
import type { SessionLog } from '../types'

export type SessionInput = Omit<SessionLog, 'id' | 'accountId'>

export function fromRow(row: Record<string, any>): SessionLog {
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.date,
    pnl: Number(row.pnl),
    trades: row.trades,
    consecutiveLosses: row.consecutive_losses,
    highestUnrealized: row.highest_unrealized !== null ? Number(row.highest_unrealized) : undefined,
    rulesFollowed: row.rules_followed,
    notes: row.notes ?? undefined,
  }
}

export function toRow(s: SessionLog): Record<string, unknown> {
  return {
    date: s.date,
    pnl: s.pnl,
    trades: s.trades,
    consecutive_losses: s.consecutiveLosses,
    highest_unrealized: s.highestUnrealized,
    rules_followed: s.rulesFollowed,
    notes: s.notes,
  }
}

export async function listSessions(): Promise<SessionLog[]> {
  return (await selectAll('sessions', { orderBy: 'date' })).map(fromRow)
}

/** Upserts a session for an account on a given date.
 *
 * This no longer writes back to `accounts.balance`. It used to read the
 * account's stored balance, add the P&L delta, and update the row — a
 * read-modify-write from the browser with no transaction, on a column that
 * logging a *trade* never touched. Balance is derived from trades, sessions and
 * payouts now (see utils/ledger.ts), so there's one number and nothing to keep
 * in sync. */
export async function logSession(userId: string, accountId: string, input: SessionInput): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from('sessions')
    .select('id')
    .eq('account_id', accountId)
    .eq('date', input.date)
    .maybeSingle()
  if (findError) throw findError

  const row = toRow({ ...input, id: existing?.id, accountId })

  if (existing) {
    const { error } = await supabase.from('sessions').update(row).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('sessions').insert({ user_id: userId, account_id: accountId, ...row })
    if (error) throw error
  }
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) throw error
}

/** Today, in the trader's local zone. Was `toISOString().slice(0, 10)`, which
 * returns tomorrow's date for anyone east of UTC late in their evening. */
export function todayISO(): string {
  return todayTradingDay()
}
