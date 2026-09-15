import { supabase } from '../lib/supabaseClient'
import { selectAll } from './paginate'
import type { Payout } from '../types'

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
  return (await selectAll('payouts', { orderBy: 'date' })).map(fromRow)
}

/** Records a payout — `requested` is what left the account, `received` is what
 * reached the trader after any profit split.
 *
 * This used to also bump `accounts.payouts_done`, `cumulative_paid` and
 * `balance` in a second, untransacted write. All three are derivable from the
 * payouts table itself, so a half-failed pair of writes can no longer leave the
 * account disagreeing with its own history. See utils/ledger.ts. */
export async function recordPayout(userId: string, accountId: string, date: string, requested: number, received: number): Promise<void> {
  const { error } = await supabase
    .from('payouts')
    .insert({ user_id: userId, ...toRow({ accountId, date, requested, received }) })
  if (error) throw error
}

export async function deletePayout(id: string): Promise<void> {
  const { error } = await supabase.from('payouts').delete().eq('id', id)
  if (error) throw error
}
