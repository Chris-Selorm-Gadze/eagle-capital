import { supabase } from '../lib/supabaseClient'

/* Scheduled account deletion with a 30-day retention window.
 *
 * Erasure used to be immediate and irreversible: a loop of DELETEs fired
 * straight from Settings. A mis-click destroyed a trading history with nothing
 * to undo it, and the parts the browser genuinely can't reach — the auth.users
 * row, and every uploaded screenshot sitting in a public Storage bucket — were
 * never removed at all, so "deleted" left both behind.
 *
 * Now the browser only records an intent. Until `purgeAfter` the user can sign
 * back in and cancel with one click; after it, the purge-deleted-accounts Edge
 * Function does the real erasure with the service-role key.
 *
 * The window itself is set by a database default, not by this file, so a client
 * with a wrong clock can't shorten it. RETENTION_DAYS here is for display only
 * and must match the interval in supabase/schema.sql.
 */

export const RETENTION_DAYS = 30

export interface DeletionRequest {
  userId: string
  requestedAt: string
  /** ISO instant after which the data is permanently erased. */
  purgeAfter: string
  reason?: string
}

function fromRow(row: Record<string, any>): DeletionRequest {
  return {
    userId: row.user_id,
    requestedAt: row.requested_at,
    purgeAfter: row.purge_after,
    reason: row.reason ?? undefined,
  }
}

/** The signed-in user's pending deletion, or null if they have none. */
export async function getDeletionRequest(): Promise<DeletionRequest | null> {
  const { data, error } = await supabase.from('account_deletions').select('*').maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

/** Schedules erasure. Idempotent: requesting twice keeps the original date
 * rather than restarting the clock, so a user can't accidentally extend their
 * own grace period by clicking again. */
export async function requestAccountDeletion(userId: string, reason?: string): Promise<DeletionRequest> {
  const existing = await getDeletionRequest()
  if (existing) return existing

  const { data, error } = await supabase
    .from('account_deletions')
    .insert({ user_id: userId, reason: reason?.trim() || null })
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

/** Calls the deletion off. Nothing has been erased yet, so this is a complete
 * reversal — the row simply stops existing and the purge job never sees it. */
export async function cancelAccountDeletion(userId: string): Promise<void> {
  const { error } = await supabase.from('account_deletions').delete().eq('user_id', userId)
  if (error) throw error
}

/** Whole days left before erasure, floored at 0. */
export function daysUntilPurge(purgeAfter: string, now: Date = new Date()): number {
  const ms = new Date(purgeAfter).getTime() - now.getTime()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}
