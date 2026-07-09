import { supabase } from '../lib/supabaseClient'
import { updateAccount } from './accounts'
import type { Account, Payout } from '../types'

export function fromRow(row: Record<string, any>): Payout {
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.date,
    requested: Number(row.requested),
    received: Number(row.received),
  }
}

export function toRow(p: Payout): Record<string, unknown> {
  return { account_id: p.accountId, date: p.date, requested: p.requested, received: p.received }
}

export async function listPayouts(): Promise<Payout[]> {
  const { data, error } = await supabase.from('payouts').select('*').order('date', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

/** Record a payout request/receipt (both entered directly) and bump the account's counters. */
export async function recordPayout(userId: string, account: Account, date: string, requested: number, received: number): Promise<void> {
  const cumulativePaid = account.cumulativePaid ?? 0
  const { error } = await supabase
    .from('payouts')
    .insert({ user_id: userId, ...toRow({ accountId: account.id!, date, requested, received }) })
  if (error) throw error
  await updateAccount(account.id!, {
    payoutsDone: (account.payoutsDone ?? 0) + 1,
    cumulativePaid: cumulativePaid + received,
    balance: account.balance - requested,
  })
}
