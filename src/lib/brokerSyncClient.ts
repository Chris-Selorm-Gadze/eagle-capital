import { supabase } from './supabaseClient'

// Talks to the separate eaglecapital-broker-sync backend — the only two writes that must never
// touch the browser directly: submitting real broker credentials, and triggering a manual sync.
// Everything else (connection status, last_synced_at, last_error) is read straight from Supabase
// via db/brokerConnections.ts, same as every other table in this app.

const apiUrl = import.meta.env.VITE_BROKER_SYNC_API_URL

export const brokerSyncConfigured = Boolean(apiUrl)

if (!brokerSyncConfigured) {
  // eslint-disable-next-line no-console
  console.warn('Broker sync env var missing — set VITE_BROKER_SYNC_API_URL in .env.local. Live Tradovate sync is disabled until then.')
}

export interface TradovateCredentials {
  name: string
  password: string
  deviceId: string
}

/** One real account fetched from Tradovate the moment credentials verify — unlike MT5's single
 * account per login, one Tradovate login can expose several of these; the frontend shows all of
 * them and lets the user pick which to import (see ImportTradovateAccountsDialog). */
export interface TradovateFetchedAccount {
  externalId: number
  name: string
  accountType: string
  active: boolean
  balance: number | null
}

export interface MetaApiCredentials {
  login: string
  password: string // investor (read-only), or trading password if used as a copier follower
  server: string
}

/** Real account data fetched live from MetaApi the moment credentials verify — lets a "live"
 * account (see AddAccountDialog.tsx) be created from real numbers instead of the user retyping
 * balance/currency they'd just authenticated with. */
export interface LiveAccountInfo {
  balance: number
  currency: string
  broker: string
  login: number
  server: string
  accountType: 'demo' | 'real' | 'contest'
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  return { Authorization: `Bearer ${token}` }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()), ...(init?.headers ?? {}) }
  const res = await fetch(`${apiUrl}${path}`, { ...init, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Broker sync API ${path} failed: ${res.status}`)
  return body as T
}

export function submitTradovateCredentials(connectionId: string, creds: TradovateCredentials): Promise<{ status: string; error?: string; accounts?: TradovateFetchedAccount[] }> {
  return request(`/connections/${connectionId}/credentials`, { method: 'POST', body: JSON.stringify(creds) })
}

export function submitMetaApiCredentials(connectionId: string, creds: MetaApiCredentials): Promise<{ status: string; error?: string; info?: LiveAccountInfo }> {
  return request(`/connections/${connectionId}/credentials`, { method: 'POST', body: JSON.stringify(creds) })
}

export function triggerSync(connectionId: string): Promise<{ imported: number; skipped: number }> {
  return request(`/connections/${connectionId}/sync`, { method: 'POST' })
}

// MetaApi bills deployed (and especially CopyFactory-enabled) accounts as a flat recurring cost
// for however long they stay deployed, not per API call — undeploying when not actively testing
// stops that cost, redeploying brings the cloud terminal back before use.
export function getDeploymentState(connectionId: string): Promise<{ state: string }> {
  return request(`/connections/${connectionId}/deployment-state`)
}

export function undeployConnection(connectionId: string): Promise<{ state: string }> {
  return request(`/connections/${connectionId}/undeploy`, { method: 'POST' })
}

export function deployConnection(connectionId: string): Promise<{ state: string }> {
  return request(`/connections/${connectionId}/deploy`, { method: 'POST' })
}
