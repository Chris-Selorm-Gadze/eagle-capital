import { supabase } from '../lib/supabaseClient'
import { updateAccount } from './accounts'
import type { Account, SessionLog } from '../types'

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
  const { data, error } = await supabase.from('sessions').select('*').order('date', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

/** Upsert today's (or any date's) session for an account and roll the pnl into balance/highestBalance. */
export async function logSession(userId: string, account: Account, input: SessionInput): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from('sessions')
    .select('id, pnl')
    .eq('account_id', account.id!)
    .eq('date', input.date)
    .maybeSingle()
  if (findError) throw findError

  const pnlDelta = input.pnl - (existing?.pnl ?? 0)
  const newBalance = account.balance + pnlDelta
  const newHighest = Math.max(account.highestBalance, newBalance, input.highestUnrealized ?? 0)

  const row = toRow({ ...input, id: existing?.id, accountId: account.id! })

  if (existing) {
    const { error } = await supabase.from('sessions').update(row).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('sessions').insert({ user_id: userId, account_id: account.id!, ...row })
    if (error) throw error
  }

  await updateAccount(account.id!, { balance: newBalance, highestBalance: newHighest })
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
