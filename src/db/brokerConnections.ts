import { supabase } from '../lib/supabaseClient'

export interface BrokerConnection {
  id: string
  brokerId: string
  label: string
  status: 'pending' | 'connected' | 'error' | 'disconnected'
  accountId?: string
  lastSyncedAt?: string
  lastError?: string
}

function fromRow(row: Record<string, any>): BrokerConnection {
  return {
    id: row.id,
    brokerId: row.broker_id,
    label: row.label,
    status: row.status,
    accountId: row.account_id ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    lastError: row.last_error ?? undefined,
  }
}

export async function listBrokerConnections(): Promise<BrokerConnection[]> {
  const { data, error } = await supabase
    .from('broker_connections')
    .select('id, broker_id, label, status, account_id, last_synced_at, last_error')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function addBrokerConnection(userId: string, brokerId: string, label: string): Promise<string> {
  const { data, error } = await supabase
    .from('broker_connections')
    .insert({ user_id: userId, broker_id: brokerId, label })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** Links (or unlinks, if accountId is null) a connection to one of the user's existing Account
 * rows — the account whose balance/trades this connection will keep in sync going forward. */
export async function linkAccount(connectionId: string, accountId: string | null): Promise<void> {
  const { error } = await supabase.from('broker_connections').update({ account_id: accountId }).eq('id', connectionId)
  if (error) throw error
}

export async function deleteBrokerConnection(id: string): Promise<void> {
  const { error } = await supabase.from('broker_connections').delete().eq('id', id)
  if (error) throw error
}
