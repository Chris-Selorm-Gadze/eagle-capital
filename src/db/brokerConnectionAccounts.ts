import { supabase } from '../lib/supabaseClient'

/** One tradeable account under a broker_connections login. MT5 doesn't use this table at all —
 * one login is one account there, tracked directly via broker_connections.account_id. This is for
 * brokers like Tradovate/Topstep where one login exposes a *list* of accounts, so one connection
 * can have several of these, each synced independently. */
export interface BrokerConnectionAccount {
  id: string
  connectionId: string
  accountId?: string
  externalAccountId: string
  externalLabel?: string
  lastSyncedAt?: string
  lastError?: string
}

function fromRow(row: Record<string, any>): BrokerConnectionAccount {
  return {
    id: row.id,
    connectionId: row.connection_id,
    accountId: row.account_id ?? undefined,
    externalAccountId: row.external_account_id,
    externalLabel: row.external_label ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    lastError: row.last_error ?? undefined,
  }
}

export async function listSubAccounts(connectionId: string): Promise<BrokerConnectionAccount[]> {
  const { data, error } = await supabase
    .from('broker_connection_accounts')
    .select('id, connection_id, account_id, external_account_id, external_label, last_synced_at, last_error')
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

/** Links one broker-fetched account (externalAccountId) to a newly-created or existing EagleCapital
 * Account row. Upserts on (connection_id, external_account_id) so re-verifying the same login later
 * doesn't create duplicate rows for accounts already imported. */
export async function linkSubAccount(userId: string, connectionId: string, accountId: string, externalAccountId: string, externalLabel?: string): Promise<void> {
  const { error } = await supabase
    .from('broker_connection_accounts')
    .upsert(
      { user_id: userId, connection_id: connectionId, account_id: accountId, external_account_id: externalAccountId, external_label: externalLabel },
      { onConflict: 'connection_id,external_account_id' },
    )
  if (error) throw error
}
