import { supabase } from './supabaseClient'

/* The one call that needs a server.
 *
 * Connecting a broker account means storing its password, and that password has
 * to be encrypted with a key the browser must never hold. So this single write
 * goes through the `copier-gateway` Edge Function, which encrypts it with
 * AES-256-GCM before it reaches a row. Everything else on the Trade Copier page
 * is a direct, RLS-scoped Supabase write — see db/copierActions.ts.
 *
 * The gateway lives in the same Supabase project as the data, so there is no
 * separate service to deploy, no second URL to configure, and nothing to keep
 * awake. It replaced a FastAPI service that slept on a free tier and pointed at
 * a paused database.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined

/** The same origin the rest of the app already talks to — there is deliberately
 * no separate env var for this. A second URL is a second thing to get wrong, and
 * the previous architecture got it wrong in exactly that way (a copier pointed
 * at `http://localhost:8787` in production). */
export const gatewayUrl = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/copier-gateway` : ''

export const copierGatewayConfigured = Boolean(gatewayUrl)

export interface GatewayAccountInput {
  platform?: string
  account_number: string
  broker_server: string
  password: string
  account_label?: string
  /** Which broker preset the user picked. The worker matches it against the MT5
   * installs on its machine to assign a terminal, so the user never sees a path. */
  broker_slug?: string
  /** Normally omitted. An override for a non-standard install. */
  terminal_path?: string
  api_base_url?: string
}

export interface GatewayAccount {
  id: string
  account_number: string
  broker_server: string
  account_label: string | null
  platform: string
  connection_status: string
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? '',
  }
}

function messageFrom(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (status === 401) return 'Your session expired. Sign in again.'
  if (status === 409) return 'That account is already connected.'
  return `Could not connect the account (${status}).`
}

export async function createAccount(input: GatewayAccountInput): Promise<GatewayAccount> {
  if (!copierGatewayConfigured) throw new Error('Supabase is not configured.')

  const res = await fetch(`${gatewayUrl}/accounts`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ platform: 'mt5', ...input }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(messageFrom(res.status, body))
  return body as GatewayAccount
}

export interface GatewayCredentialsInput {
  password: string
  broker_server?: string
  terminal_path?: string | null
}

/** Re-encrypts an account's credentials. Goes through the gateway for the same
 * reason creating one does: the password must be encrypted with a key the
 * browser can never hold. */
export async function updateCredentials(
  accountId: string, input: GatewayCredentialsInput,
): Promise<void> {
  if (!copierGatewayConfigured) throw new Error('Supabase is not configured.')

  const res = await fetch(`${gatewayUrl}/accounts/${accountId}/credentials`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(messageFrom(res.status, body))
  }
}

/** Liveness of the gateway itself, for diagnostics. Deliberately unauthenticated
 * and side-effect free. */
export async function gatewayHealth(): Promise<boolean> {
  if (!copierGatewayConfigured) return false
  try {
    const res = await fetch(`${gatewayUrl}/health`, {
      headers: { apikey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? '' },
    })
    return res.ok
  } catch {
    return false
  }
}
