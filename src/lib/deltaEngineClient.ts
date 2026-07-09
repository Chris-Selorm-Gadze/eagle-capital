import { supabase } from './supabaseClient'

// Delta Engine is a separate, already-running system (github.com/richmondazadze/delta_engine) —
// its own FastAPI backend/MT5 worker, but it now shares EagleCapital's Supabase project for auth,
// so signing into EagleCapital IS signing into Delta Engine. EagleCapital talks to its API purely
// as an HTTP client; nothing here touches Delta Engine's database, backend, or the live worker directly.

const apiUrl = import.meta.env.VITE_DELTA_API_URL

export const deltaEngineConfigured = Boolean(apiUrl)

if (!deltaEngineConfigured) {
  // eslint-disable-next-line no-console
  console.warn('Delta Engine env vars missing — set VITE_DELTA_API_URL in .env.local. Trade Copier is disabled until then.')
}

export type Platform = 'mt5' | 'mt4' | 'ctrader' | 'dxtrade' | 'matchtrader' | 'tradelocker' | 'ninjatrader' | 'tradingview'
export type ConnectionStatus = 'connected' | 'disconnected' | 'auth_failed' | 'terminal_unavailable' | 'broker_unavailable' | 'disabled' | 'locked'
export type RiskMode = 'multiplier' | 'fixed_lot' | 'equity_ratio' | 'risk_percent'

export interface DeltaAccount {
  id: string
  platform: Platform
  account_number: string
  broker_server: string
  account_label: string | null
  connection_status: ConnectionStatus
  balance: number | null
  equity: number | null
  currency: string | null
  is_enabled: boolean
}

export interface DeltaCopier {
  id: string
  master_account_id: string
  follower_account_id: string
  label: string | null
  risk_mode: RiskMode
  multiplier: number
  fixed_lot_size: number
  is_enabled: boolean
}

export interface CopierCreateInput {
  master_account_id: string
  follower_account_id: string
  label?: string
  risk_mode?: RiskMode
  multiplier?: number
  fixed_lot_size?: number
}

export interface DeltaRiskProfile {
  id: string
  account_id: string
  max_daily_loss: number | null
  max_total_loss: number | null
  min_equity: number | null
  max_lot_per_trade: number | null
  max_open_positions: number
  max_trades_per_day: number | null
  is_locked: boolean
  locked_reason: string | null
  daily_loss_accumulated: number
  daily_trades_count: number
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
  if (!res.ok) throw new Error(`Delta Engine API ${path} failed: ${res.status} ${await res.text()}`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function listAccounts(): Promise<{ accounts: DeltaAccount[]; total: number }> {
  return request('/api/accounts')
}

export function listCopiers(): Promise<{ copiers: DeltaCopier[]; total: number }> {
  return request('/api/copiers')
}

export function createCopier(input: CopierCreateInput): Promise<DeltaCopier> {
  return request('/api/copiers', { method: 'POST', body: JSON.stringify(input) })
}

export function enableCopier(copierId: string): Promise<DeltaCopier> {
  return request(`/api/copiers/${copierId}/enable`, { method: 'POST' })
}

export function disableCopier(copierId: string): Promise<DeltaCopier> {
  return request(`/api/copiers/${copierId}/disable`, { method: 'POST' })
}

export function deleteCopier(copierId: string): Promise<void> {
  return request(`/api/copiers/${copierId}`, { method: 'DELETE' })
}

export function listRiskProfiles(): Promise<{ profiles: DeltaRiskProfile[]; total: number }> {
  return request('/api/risk-profiles')
}

export function unlockRiskProfile(profileId: string): Promise<DeltaRiskProfile> {
  return request(`/api/risk-profiles/${profileId}/unlock`, { method: 'POST' })
}

export function flattenPositions(profileId: string): Promise<unknown> {
  return request(`/api/risk-profiles/${profileId}/flatten`, { method: 'POST' })
}
