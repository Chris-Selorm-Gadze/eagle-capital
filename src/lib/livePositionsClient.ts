import { supabase } from './supabaseClient'

// Backed by eaglecapital-broker-sync's /api/live-positions + /ws/live-positions — same backend/
// API URL as copierClient.ts and brokerSyncClient.ts. Broker-agnostic on the backend (any
// connected account, not just ones in a copier relationship); today only MT5 actually returns
// real positions, other brokers report a clear per-account error instead of fake data.

const apiUrl = import.meta.env.VITE_BROKER_SYNC_API_URL

export const livePositionsConfigured = Boolean(apiUrl)

export interface LivePosition {
  connectionId: string
  positionId: string
  symbol: string
  side: 'long' | 'short'
  qty: number
  openPrice: number
  currentPrice: number | null
  unrealizedPnl: number
  openTime: string
}

export interface LiveAccountPositions {
  connectionId: string
  label: string
  broker: string
  balance: number | null
  equity: number | null
  positions: LivePosition[]
  error: string | null
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  return { Authorization: `Bearer ${token}` }
}

/** Plain REST fallback — the Live Positions page itself uses the WebSocket in
 * livePositionsSocket.ts so it doesn't pay for a live round-trip per account on every page view. */
export async function getLivePositions(): Promise<{ accounts: LiveAccountPositions[] }> {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
  const res = await fetch(`${apiUrl}/api/live-positions`, { headers })
  if (!res.ok) throw new Error(`Live positions API failed: ${res.status} ${await res.text()}`)
  return res.json()
}
