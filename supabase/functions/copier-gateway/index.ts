// Copier gateway — the trade copier's control plane.
//
// WHY THIS EXISTS
// The Windows worker that holds MT5 terminals open used to talk to a separate
// FastAPI service (delta_engine's `backend/`, deployed on Render) backed by its
// own Supabase project. That arrangement had three problems: the project was
// paused, so the live API had a dead database behind it; each Supabase project
// signs JWTs with its own secret, so an EagleCapital session could never
// authenticate there; and the service slept on a free tier, cold-starting for
// 60-90s — not viable for something that arms live trades.
//
// Consolidating the copier's tables into this project removed most of the
// reason that service existed. The worker only ever calls twelve endpoints, all
// under /internal/*, and every one of them is thin CRUD over tables that now
// live here. This function is a faithful port of exactly those twelve, so the
// worker needs NO code changes — only API_URL pointed here:
//
//   API_URL=https://<project>.supabase.co/functions/v1/copier-gateway
//
// The 34 user-facing /api/* endpoints are deliberately NOT ported. With the
// tables in this project, RLS already scopes every row to auth.uid(), so the
// browser reads and writes them directly (src/db/copier.ts, copierActions.ts).
// The one exception is account creation, which needs ENCRYPTION_KEY and is
// therefore served here too.
//
// Deploy:
//   supabase functions deploy copier-gateway --no-verify-jwt
//
// --no-verify-jwt is required: the worker authenticates with X-Worker-Key, not
// a user JWT. Every /internal route checks that key itself. The one JWT-bearing
// route (/accounts) verifies the token explicitly.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const WORKER_API_KEY = Deno.env.get('WORKER_API_KEY') ?? ''
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') ?? ''

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/* ── Credential encryption ──────────────────────────────────────────────────
 * Byte-compatible with delta_engine's backend/app/core/encryption.py:
 * AES-256-GCM, a fresh 12-byte nonce per encryption, no additional data, and
 * base64(nonce || ciphertext || tag). WebCrypto appends the 16-byte tag to the
 * ciphertext exactly as Python's `cryptography` AESGCM does, so blobs written
 * by either implementation decrypt in the other. That matters: it means this
 * function can be swapped back for the Python service without re-entering a
 * single broker password. */

const NONCE_BYTES = 12

let cachedKey: CryptoKey | null = null

async function encryptionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (256 bits).')
  }
  const raw = new Uint8Array(
    (ENCRYPTION_KEY.match(/.{2}/g) as string[]).map((b) => parseInt(b, 16)),
  )
  cachedKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  return cachedKey
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function encryptPassword(plaintext: string): Promise<string> {
  const key = await encryptionKey()
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, new TextEncoder().encode(plaintext)),
  )
  const blob = new Uint8Array(nonce.length + ciphertext.length)
  blob.set(nonce, 0)
  blob.set(ciphertext, nonce.length)
  return toBase64(blob)
}

async function decryptPassword(encryptedB64: string): Promise<string> {
  const key = await encryptionKey()
  const blob = fromBase64(encryptedB64)
  const nonce = blob.slice(0, NONCE_BYTES)
  const ciphertext = blob.slice(NONCE_BYTES)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext)
  return new TextDecoder().decode(plain)
}

/* ── Auth ─────────────────────────────────────────────────────────────────── */

/** Length-checked, constant-time-ish comparison. A plain `!==` on secrets leaks
 * a little timing information; the length check first avoids comparing against
 * an empty configured key, which would otherwise accept an empty header. */
function secretMatches(provided: string, expected: string): boolean {
  if (!expected || !provided || provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

function workerAuthError(req: Request): Response | null {
  if (!WORKER_API_KEY) return json({ detail: 'WORKER_API_KEY is not configured.' }, 500)
  const provided = req.headers.get('x-worker-key') ?? ''
  if (!secretMatches(provided, WORKER_API_KEY)) {
    return json({ detail: 'Invalid worker API key' }, 401)
  }
  return null
}

/** The acting user. The worker is a service, not a person — it declares which
 * user's book it is running on behalf of, and the worker key is what makes that
 * claim trustworthy. Mirrors the Python `X-User-Id` header dependency. */
function actingUser(req: Request): string | null {
  return req.headers.get('x-user-id')
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-key, x-user-id',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
}

function nowIso(): string {
  return new Date().toISOString()
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/* ── /internal/runtime-config ─────────────────────────────────────────────── */

/** Which accounts are masters and which are followers, derived from the links
 * themselves. First mention wins, matching `_derive_account_roles`. */
function deriveRoles(copiers: Record<string, any>[]): Map<string, string> {
  const roles = new Map<string, string>()
  for (const row of copiers) {
    if (!roles.has(row.master_account_id)) roles.set(row.master_account_id, 'master')
    if (!roles.has(row.follower_account_id)) roles.set(row.follower_account_id, 'follower')
  }
  return roles
}

async function runtimeAccount(row: Record<string, any>, role: string) {
  return {
    id: row.id,
    label: row.account_label || String(row.account_number),
    role,
    login: String(row.account_number),
    password: await decryptPassword(row.encrypted_password),
    server: row.broker_server,
    // Passed through as stored. The Python original probed the filesystem here
    // (`path_exists`) to fill in a broker-preset default — but it ran on the API
    // host, not the Windows machine that owns the terminal, so on a Linux
    // deployment that check was always false. The worker knows its own disk.
    terminal_path: row.terminal_path ?? null,
    // Which broker's MT5 build this account needs. The worker uses it to claim a
    // matching terminal when terminal_path is null.
    broker_slug: row.broker_slug ?? null,
    api_base_url: row.api_base_url ?? null,
    platform: String(row.platform ?? 'mt5'),
    enabled: row.is_enabled ?? true,
    // The dashboard account this account's closed trades are journalled
    // against, and where its deal-history read should resume from. Null means
    // "not journalled" -- the worker then does not read history for it at all,
    // which is also how linking one takes effect on the next config reload
    // rather than on a restart.
    journal_account_id: row.account_id ?? null,
    history_synced_to: row.history_synced_to ?? null,
  }
}

async function getRuntimeConfig(userId: string): Promise<Response> {
  const { data: copierRows, error: copierErr } = await admin
    .from('copier_relations').select('*').eq('user_id', userId)
  if (copierErr) return json({ detail: copierErr.message }, 500)

  const copiers = copierRows ?? []
  const enabled = copiers.filter((r) => r.is_enabled)
  // 404 rather than an empty payload, matching the original. The worker treats
  // this as "nothing to run" and keeps polling rather than tearing down.
  if (enabled.length === 0) {
    return json({ detail: 'No enabled copier relations for this user' }, 404)
  }

  const accountIds = [...new Set(copiers.flatMap((r) => [r.master_account_id, r.follower_account_id]))]

  const { data: accountRows, error: accErr } = await admin
    .from('trading_accounts').select('*')
    .eq('user_id', userId).in('id', accountIds).eq('is_enabled', true)
  if (accErr) return json({ detail: accErr.message }, 500)
  if (!accountRows || accountRows.length === 0) {
    return json({ detail: 'No enabled trading accounts found' }, 404)
  }

  const roles = deriveRoles(copiers)

  let accounts
  try {
    accounts = await Promise.all(
      accountRows.map((row) => runtimeAccount(row, roles.get(row.id) ?? 'follower')),
    )
  } catch (e) {
    // A password that will not decrypt is not a 500 to shrug at: it means the
    // key changed, and every account under it is unusable until re-entered.
    return json({ detail: `Credential decryption failed: ${e instanceof Error ? e.message : e}` }, 500)
  }

  const { data: mappingRows } = await admin
    .from('symbol_mappings').select('*').eq('user_id', userId).eq('is_active', true)

  const { data: riskRows } = await admin
    .from('risk_profiles').select('*').eq('user_id', userId)

  return json({
    user_id: userId,
    accounts,
    copiers: copiers.map((row) => ({
      id: row.id,
      master_id: row.master_account_id,
      follower_id: row.follower_account_id,
      enabled: row.is_enabled ?? true,
      risk_mode: row.risk_mode ?? 'multiplier',
      multiplier: Number(row.multiplier ?? 1.0),
      fixed_lot_size: Number(row.fixed_lot_size ?? 0.01),
      copy_sl: row.copy_sl ?? true,
      copy_tp: row.copy_tp ?? true,
      copy_closes: row.copy_closes ?? true,
      copy_modifications: row.copy_modifications ?? true,
      max_signal_age_ms: Number(row.max_signal_age_ms ?? 3000),
    })),
    symbol_mappings: (mappingRows ?? []).map((row) => ({
      master_symbol: row.master_symbol,
      follower_symbol: row.follower_symbol,
      master_account_id: row.master_account_id ?? null,
      follower_account_id: row.follower_account_id ?? null,
    })),
    risk_profiles: (riskRows ?? []).map((row) => ({
      id: row.id,
      account_id: row.account_id,
      max_daily_loss: num(row.max_daily_loss),
      max_total_loss: num(row.max_total_loss),
      min_equity: num(row.min_equity),
      max_lot_per_trade: num(row.max_lot_per_trade),
      max_open_positions: row.max_open_positions ?? null,
      max_trades_per_day: row.max_trades_per_day ?? null,
      allowed_symbols: row.allowed_symbols ?? null,
      blocked_symbols: row.blocked_symbols ?? null,
      is_locked: row.is_locked ?? false,
      locked_reason: row.locked_reason ?? null,
      daily_loss_accumulated: Number(row.daily_loss_accumulated ?? 0),
      daily_trades_count: Number(row.daily_trades_count ?? 0),
    })),
  })
}

/* ── /internal/whoami ─────────────────────────────────────────────────────── */

/** Diagnostic: what does this worker's user id actually own?
 *
 * runtime-config answers 404 whenever nothing is armed — and it answers exactly
 * the same 404 for a user id that does not exist at all. So the single most
 * common setup mistake (pointing a worker at the wrong user) is invisible until
 * someone arms a live copy link to find out, which is the worst possible moment
 * to discover it.
 *
 * This is read-only, returns counts and labels rather than credentials, and is
 * called by show_config.py. The worker itself never calls it.
 */
async function whoami(userId: string): Promise<Response> {
  const { data: user } = await admin
    .from('tc_users').select('id, email').eq('id', userId).maybeSingle()

  // Errors are surfaced, not swallowed. A select naming a column that does not
  // exist returns no rows and no exception, so a forgotten migration looked
  // exactly like "this user owns nothing" -- which is the single most
  // misleading answer a diagnostic can give.
  const { data: accounts, error: accErr } = await admin
    .from('trading_accounts')
    .select('id, account_label, account_number, platform, connection_status, terminal_path, broker_slug, is_enabled')
    .eq('user_id', userId)
  if (accErr) {
    return json({
      detail: `Could not read accounts: ${accErr.message}`,
      hint: 'A missing column usually means a migration has not been run.',
    }, 500)
  }

  const { data: relations } = await admin
    .from('copier_relations').select('is_enabled').eq('user_id', userId)

  const rels = relations ?? []
  return json({
    user_id: userId,
    known_user: Boolean(user),
    email: user?.email ?? null,
    // The worker reads this to work out which terminals its other accounts
    // already hold, so it can claim a free one for the account being tested.
    accounts: (accounts ?? []).map((a) => ({
      id: a.id,
      label: a.account_label || String(a.account_number),
      platform: a.platform,
      connection_status: a.connection_status,
      terminal_path: a.terminal_path,
      broker_slug: a.broker_slug ?? null,
      enabled: a.is_enabled ?? true,
    })),
    relations: rels.length,
    enabled_relations: rels.filter((r) => r.is_enabled).length,
  })
}

/* ── /internal/open-links ─────────────────────────────────────────────────── */

/** Rebuilds still-open master→follower ticket pairs from execution history so a
 * restarted worker can keep managing positions it opened in a previous life.
 * Without this, a worker restart orphans every open trade: closes and SL/TP
 * moves on the master would no longer reach the follower. */
async function getOpenLinks(userId: string): Promise<Response> {
  const { data: opened, error } = await admin
    .from('execution_events')
    .select('copier_relation_id,master_account_id,follower_account_id,master_ticket,follower_ticket,symbol_follower,side,executed_lot,created_at')
    .eq('user_id', userId)
    .eq('event_type', 'position_opened')
    .eq('status', 'success')
    .order('created_at', { ascending: true })
    .limit(5000)
  if (error) return json({ detail: error.message }, 500)

  const { data: closedRows } = await admin
    .from('execution_events')
    .select('follower_ticket,status,event_type')
    .eq('user_id', userId)
    .in('event_type', ['position_closed', 'flatten'])
    .in('status', ['closed', 'success'])
    .limit(5000)

  const closedTickets = new Set(
    (closedRows ?? []).filter((r) => r.follower_ticket).map((r) => String(r.follower_ticket)),
  )

  const links = new Map<string, Record<string, unknown>>()
  for (const row of opened ?? []) {
    const ft = row.follower_ticket
    const mt = row.master_ticket
    const cr = row.copier_relation_id
    if (!ft || !mt || !cr) continue
    if (closedTickets.has(String(ft))) continue
    // Keyed by relation + master ticket; a later open for the same pair wins.
    links.set(`${cr}:${mt}`, {
      copier_id: cr,
      master_ticket: String(mt),
      follower_ticket: String(ft),
      follower_account_id: row.follower_account_id,
      symbol: row.symbol_follower ?? '',
      side: row.side ?? '',
      volume: row.executed_lot,
    })
  }

  return json({ links: [...links.values()] })
}

/* ── Worker lifecycle ─────────────────────────────────────────────────────── */

/** Registers a worker node.
 *
 * Deliberately an upsert on (worker_name, host_identifier), where the original
 * did a bare INSERT. That INSERT created a fresh row on every worker restart,
 * so the fleet list filled with ghost workers whose heartbeats had simply
 * stopped — and a supervised worker restarts often. Returning the existing row
 * keeps one node per machine and keeps its heartbeat history continuous. The
 * worker only reads `id` from this response, so the change is invisible to it. */
async function registerWorker(req: Request, body: Record<string, any>): Promise<Response> {
  const name = body.worker_name
  if (!name) return json({ detail: 'worker_name is required' }, 422)
  const host = body.host_identifier ?? null

  const row: Record<string, unknown> = {
    worker_name: name,
    region: body.region ?? null,
    host_identifier: host,
    capacity: body.capacity ?? 1,
    status: 'online',
    metadata: body.metadata ?? null,
    last_heartbeat_at: nowIso(),
  }

  // Who this worker runs for, so the owner can see it in their own dashboard.
  //
  // worker_nodes originally carried no user at all — it was modelled as shared
  // fleet infrastructure, readable only by admins. That made the fleet banner
  // permanently read "No worker" for an ordinary user even while their worker
  // was heartbeating fine, which is the most misleading thing this page can say.
  //
  // The upstream worker does NOT send X-User-Id on register (it passes
  // include_user=False), so this stays null against an unpatched worker and the
  // RLS policy tolerates that. Once the worker sends the header, the row becomes
  // privately owned and the fallback stops applying to it.
  const actor = actingUser(req)
  if (actor) row.user_id = actor

  // `host_identifier` is nullable, and SQL equality never matches NULL — so the
  // null case has to use IS NULL or a restarted worker that reports no host
  // would register a fresh row every time.
  const lookup = admin.from('worker_nodes').select('id').eq('worker_name', name)
  const existing = await (host === null
    ? lookup.is('host_identifier', null)
    : lookup.eq('host_identifier', host)
  ).maybeSingle()

  if (existing.data?.id) {
    const { data, error } = await admin
      .from('worker_nodes').update(row).eq('id', existing.data.id).select().single()
    if (error) return json({ detail: error.message }, 500)
    return json(data)
  }

  const { data, error } = await admin.from('worker_nodes').insert(row).select().single()
  if (error) return json({ detail: error.message }, 500)
  return json(data)
}

async function heartbeat(body: Record<string, any>): Promise<Response> {
  if (!body.worker_id) return json({ detail: 'worker_id is required' }, 422)
  const { error } = await admin.from('worker_nodes').update({
    active_sessions: body.active_sessions ?? 0,
    last_heartbeat_at: nowIso(),
    status: 'online',
    metadata: body.metadata ?? null,
  }).eq('id', body.worker_id)
  if (error) return json({ detail: error.message }, 500)
  return json({ status: 'ok' })
}

async function sessionStarted(body: Record<string, any>): Promise<Response> {
  const accountId = body.trading_account_id
  if (!accountId) return json({ detail: 'trading_account_id is required' }, 422)
  const now = nowIso()

  const { data: existing } = await admin
    .from('worker_sessions').select('id')
    .eq('trading_account_id', accountId)
    .in('session_status', ['starting', 'running', 'reconnecting'])
    .maybeSingle()

  const session = {
    worker_node_id: body.worker_id ?? null,
    session_status: 'running',
    terminal_path: body.terminal_path ?? null,
    process_id: body.process_id ?? null,
    last_heartbeat_at: now,
  }

  if (existing?.id) {
    await admin.from('worker_sessions').update(session).eq('id', existing.id)
  } else {
    await admin.from('worker_sessions').insert({ ...session, trading_account_id: accountId, started_at: now })
  }

  await admin.from('trading_accounts')
    .update({ connection_status: 'connected', last_error: null, last_connected_at: now })
    .eq('id', accountId)

  return json({ status: 'ok' })
}

async function sessionFailed(body: Record<string, any>): Promise<Response> {
  const accountId = body.trading_account_id
  if (!accountId) return json({ detail: 'trading_account_id is required' }, 422)

  await admin.from('worker_sessions').update({
    session_status: 'failed',
    last_error: body.error ?? null,
    stopped_at: nowIso(),
  }).eq('trading_account_id', accountId)

  await admin.from('trading_accounts').update({
    connection_status: 'auth_failed',
    last_error: body.error ?? null,
  }).eq('id', accountId)

  return json({ status: 'ok' })
}

/* ── Execution events ─────────────────────────────────────────────────────── */

/** Fields a worker is allowed to write. Whitelisted rather than spread, so a
 * future worker version sending an unexpected key gets a clean insert instead
 * of a PostgREST column error in the copy hot path. */
const EVENT_FIELDS = [
  'copier_relation_id', 'master_account_id', 'follower_account_id', 'event_type',
  'master_ticket', 'follower_ticket', 'symbol_master', 'symbol_follower', 'side',
  'requested_lot', 'executed_lot', 'requested_price', 'executed_price',
  'slippage_points', 'latency_ms', 'switch_ms', 'order_ms', 'e2e_ms',
  'status', 'broker_return_code', 'error_message', 'raw_payload',
]

function eventRow(payload: Record<string, any>, userId: string): Record<string, unknown> {
  const row: Record<string, unknown> = { user_id: userId }
  for (const f of EVENT_FIELDS) if (payload[f] !== undefined) row[f] = payload[f]
  return row
}

async function createEvent(body: Record<string, any>, userId: string): Promise<Response> {
  const { data, error } = await admin.from('execution_events').insert(eventRow(body, userId)).select().single()
  if (error) return json({ detail: error.message }, 500)
  return json(data, 201)
}

async function createEventBatch(body: Record<string, any>, userId: string): Promise<Response> {
  const events: Record<string, any>[] = body.events ?? []
  if (events.length === 0) return json({ inserted: 0, events: [] }, 201)
  const { data, error } = await admin
    .from('execution_events').insert(events.map((e) => eventRow(e, userId))).select()
  if (error) return json({ detail: error.message }, 500)
  return json({ inserted: data?.length ?? 0, events: data ?? [] }, 201)
}

/* ── Worker commands ──────────────────────────────────────────────────────── */

async function pendingCommands(userId: string): Promise<Response> {
  const { data, error } = await admin
    .from('worker_commands').select('*')
    .eq('user_id', userId).eq('status', 'pending')
    .order('created_at', { ascending: true }).limit(20)
  if (error) return json({ detail: error.message }, 500)
  return json({ commands: data ?? [] })
}

async function completeCommand(commandId: string, body: Record<string, any>): Promise<Response> {
  const { data: cmd } = await admin
    .from('worker_commands').select('command_type, trading_account_id').eq('id', commandId).maybeSingle()

  const success = body.success ?? true
  await admin.from('worker_commands').update({
    status: success ? 'completed' : 'failed',
    result: body.result ?? {},
    error_message: body.error ?? null,
    completed_at: nowIso(),
  }).eq('id', commandId)

  // A completed connection test is how an account's status becomes truthful:
  // the worker is the only thing that can actually reach the broker, so its
  // answer is the authoritative one.
  if (cmd?.command_type === 'test_connection' && cmd.trading_account_id) {
    const result = body.result ?? {}
    if (success) {
      const patch: Record<string, unknown> = {
        connection_status: 'connected',
        last_error: null,
        last_connected_at: nowIso(),
        balance: result.balance ?? null,
        equity: result.equity ?? null,
        currency: result.currency ?? null,
      }
      // The worker assigns terminals; this is where an assignment becomes
      // permanent. It must persist or the account would be reassigned on every
      // restart, resetting its warm session and re-downloading history.
      if (typeof result.terminal_path === 'string' && result.terminal_path.trim()) {
        patch.terminal_path = result.terminal_path.trim()
      }
      // Broker ping goes in account_metadata rather than a new column: it is a
      // diagnostic, not part of the account, and last_error is cleared on
      // success so a successful test has nowhere else to say anything.
      const diag: Record<string, unknown> = {}
      if (typeof result.ping_ms === 'number') diag.ping_ms = result.ping_ms
      if (result.terminal_build) diag.terminal_build = result.terminal_build
      if (Object.keys(diag).length > 0) {
        const { data: existing } = await admin
          .from('trading_accounts').select('account_metadata')
          .eq('id', cmd.trading_account_id).maybeSingle()
        patch.account_metadata = {
          ...((existing?.account_metadata as Record<string, unknown>) ?? {}),
          ...diag,
          diagnostics_at: nowIso(),
        }
      }
      await admin.from('trading_accounts').update(patch).eq('id', cmd.trading_account_id)
    } else {
      await admin.from('trading_accounts').update({
        connection_status: result.connection_status ?? 'auth_failed',
        last_error: body.error ?? result.message ?? null,
      }).eq('id', cmd.trading_account_id)
    }
  }

  return json({ status: 'ok' })
}

/* ── Account balances ─────────────────────────────────────────────────────── */

/** Records the day's opening equity once per account per day. The dashboard's
 * "today" figure is the difference against it, so it must be written the first
 * time a balance arrives and never overwritten afterwards. */
async function ensureDailySnapshot(
  userId: string, accountId: string,
  equity: number | null, balance: number | null, currency: string | null,
): Promise<void> {
  const snapshotDate = new Date().toISOString().slice(0, 10)
  const { data: existing } = await admin
    .from('account_equity_snapshots').select('id')
    .eq('trading_account_id', accountId).eq('snapshot_date', snapshotDate).maybeSingle()
  if (existing) return
  await admin.from('account_equity_snapshots').insert({
    user_id: userId,
    trading_account_id: accountId,
    snapshot_date: snapshotDate,
    equity_open: equity,
    balance_open: balance,
    currency,
  })
}

async function updateBalances(body: Record<string, any>): Promise<Response> {
  const userId = body.user_id
  const accounts: Record<string, any>[] = body.accounts ?? []
  if (!userId) return json({ detail: 'user_id is required' }, 422)
  const now = nowIso()

  for (const row of accounts) {
    const update: Record<string, unknown> = { last_balance_sync_at: now }
    if (row.balance !== null && row.balance !== undefined) update.balance = row.balance
    if (row.equity !== null && row.equity !== undefined) update.equity = row.equity
    if (row.currency) update.currency = row.currency
    if (row.connection_status) {
      update.connection_status = row.connection_status
      if (row.connection_status === 'connected') {
        update.last_error = null
        update.last_connected_at = now
      }
    }

    await admin.from('trading_accounts').update(update)
      .eq('id', row.trading_account_id).eq('user_id', userId)

    if (row.equity !== undefined || row.balance !== undefined) {
      await ensureDailySnapshot(userId, row.trading_account_id, row.equity ?? null, row.balance ?? null, row.currency ?? null)
    }
  }

  return json({ status: 'ok', updated: accounts.length })
}

/* A side is 'long' or 'short' in this app, and nothing else may reach the
 * column: every consumer (ledger, win rate, the P&L sign) branches on it. */
const TRADE_SIDES = new Set(['long', 'short'])

function finiteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/** One worker-reported position as a `trades` row, or null if it is malformed.
 *
 * Validated rather than trusted. The worker is authenticated, but a bad row
 * here becomes a wrong equity curve that is hard to trace back, and NOT NULL
 * columns would otherwise fail the whole batch over one bad entry.
 */
function tradeRow(
  userId: string,
  dashboardAccountId: string,
  t: Record<string, any>,
): Record<string, unknown> | null {
  const externalId = typeof t.external_id === 'string' ? t.external_id.trim() : ''
  const symbol = typeof t.symbol === 'string' ? t.symbol.trim() : ''
  const side = typeof t.side === 'string' ? t.side.trim().toLowerCase() : ''
  const qty = finiteNumber(t.qty)
  const entryPrice = finiteNumber(t.entry_price)
  const exitPrice = finiteNumber(t.exit_price)
  const pnl = finiteNumber(t.pnl)
  const entryTime = isoOrNull(t.entry_time)
  const exitTime = isoOrNull(t.exit_time)

  if (!externalId || !symbol || !TRADE_SIDES.has(side)) return null
  if (qty === null || qty <= 0) return null
  if (entryPrice === null || exitPrice === null || pnl === null) return null
  if (!entryTime || !exitTime) return null

  const fees = finiteNumber(t.fees)

  return {
    user_id: userId,
    account_id: dashboardAccountId,
    external_id: externalId,
    symbol,
    side,
    qty,
    entry_price: entryPrice,
    exit_price: exitPrice,
    entry_time: entryTime,
    exit_time: exitTime,
    fees: fees === null ? null : fees,
    // MT5's own realised figure, written verbatim. NOT recomputed from the
    // prices: (exit - entry) * qty assumes one unit of volume is worth one
    // currency unit per point, which is false for index CFDs, metals and
    // crypto. src/db/trades.ts carries the same warning as `pnlOverride`.
    pnl,
    // NOT NULL, so it needs a value -- but it is not the value the app reads.
    // src/db/trades.ts `fromRow` derives the trading day from entry_time in the
    // trader's own zone, precisely because a UTC date files an evening US
    // session on the following day. This is the same UTC slice existing rows
    // have, and is corrected on read.
    date: entryTime.slice(0, 10),
  }
}

/** Journal closed positions against the dashboard account this copier account
 * is linked to.
 *
 * The worker cannot do this itself: it does not know the link, and writing
 * another table on the user's behalf needs the service-role key that only lives
 * here. Idempotent by (user_id, external_id) -- the worker re-reads its history
 * window every cycle, so a repeat has to be a no-op rather than a duplicate.
 */
async function journalClosedTrades(body: Record<string, any>): Promise<Response> {
  const userId = body.user_id
  const tradingAccountId = body.trading_account_id
  const trades: Record<string, any>[] = Array.isArray(body.trades) ? body.trades : []
  const syncedTo = isoOrNull(body.synced_to)

  if (!userId) return json({ detail: 'user_id is required' }, 422)
  if (!tradingAccountId) return json({ detail: 'trading_account_id is required' }, 422)

  const { data: account, error: accErr } = await admin
    .from('trading_accounts')
    .select('id, account_id')
    .eq('id', tradingAccountId)
    .eq('user_id', userId)
    .maybeSingle()
  if (accErr) {
    return json({
      detail: `Could not read the account: ${accErr.message}`,
      hint: 'A missing column usually means a migration has not been run.',
    }, 500)
  }
  if (!account) return json({ detail: 'Account not found' }, 404)

  // Not linked to a dashboard account yet. Not an error -- and deliberately
  // does NOT advance history_synced_to, so linking one later still picks these
  // trades up instead of starting from the moment of the link.
  if (!account.account_id) {
    return json({ status: 'ok', written: 0, skipped: trades.length, linked: false })
  }

  const rows: Record<string, unknown>[] = []
  let malformed = 0
  for (const t of trades) {
    const row = tradeRow(userId, account.account_id, t)
    if (row) rows.push(row)
    else malformed += 1
  }

  if (rows.length > 0) {
    const { error } = await admin
      .from('trades')
      .upsert(rows, { onConflict: 'user_id,external_id' })
    if (error) {
      // The mark is not advanced on a failed write, so the next cycle retries
      // the same window rather than losing these trades.
      return json({
        detail: `Could not write trades: ${error.message}`,
        hint: 'A missing external_id column or unique index usually means a migration has not been run.',
      }, 500)
    }
  }

  if (syncedTo) {
    await admin
      .from('trading_accounts')
      .update({ history_synced_to: syncedTo })
      .eq('id', tradingAccountId)
      .eq('user_id', userId)
  }

  return json({
    status: 'ok',
    written: rows.length,
    skipped: malformed,
    linked: true,
  })
}

/** Queue the connection test nobody should have to click.
 *
 * Only the worker can reach a broker, so something must queue work for it --
 * but that something does not have to be a human pressing a button. Saving
 * credentials IS the request to verify them.
 *
 * Best-effort on purpose: the account row is already written, and failing the
 * user's save because the follow-up nudge failed would be worse than being
 * untested. The manual button remains for re-testing.
 */
async function queueConnectionTest(userId: string, accountId: string): Promise<void> {
  try {
    // Don't stack tests. Each one is a real MT5 login, and on a shared terminal
    // they serialise.
    const { data: pending } = await admin
      .from('worker_commands').select('id')
      .eq('trading_account_id', accountId)
      .eq('command_type', 'test_connection')
      .eq('status', 'pending')
      .limit(1)
    if (pending && pending.length > 0) return

    await admin.from('worker_commands').insert({
      user_id: userId,
      trading_account_id: accountId,
      command_type: 'test_connection',
      status: 'pending',
      payload: {},
    })
  } catch (e) {
    console.error('queueConnectionTest failed', e instanceof Error ? e.message : e)
  }
}

/* ── User-facing: create an account ───────────────────────────────────────── */

/** The only user-facing route here, because it is the only one that needs the
 * encryption key. Everything else the browser does — creating links, arming
 * them, queueing a flatten — is an RLS-scoped write it can make directly. */
/** The signed-in user behind a browser request, or null. */
async function browserUser(req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user.id
}

/** Re-encrypt an account's credentials in place.
 *
 * Without this a mistyped password was unfixable: encrypted_password was
 * written once at creation and never again, so the only remedy was deleting the
 * account -- which cascades, taking its copy links, symbol mappings and risk
 * limits with it. Fixing a typo should not cost you your configuration.
 *
 * broker_server is accepted alongside it because a wrong server reads as a
 * rejected login, so it is the other half of the same mistake.
 */
async function updateCredentials(
  req: Request, body: Record<string, any>, accountId: string,
): Promise<Response> {
  const userId = await browserUser(req)
  if (!userId) return json({ detail: 'Not authenticated' }, 401)

  const password = String(body.password ?? '')
  if (!password) return json({ detail: 'A password is required' }, 422)

  // Scoped to the caller: admin bypasses RLS, so ownership is checked here.
  const { data: existing } = await admin
    .from('trading_accounts').select('id')
    .eq('id', accountId).eq('user_id', userId).maybeSingle()
  if (!existing) return json({ detail: 'Account not found' }, 404)

  let encrypted: string
  try {
    encrypted = await encryptPassword(password)
  } catch (e) {
    return json({ detail: e instanceof Error ? e.message : String(e) }, 500)
  }

  // The old verdict no longer applies to these credentials, so it is cleared
  // rather than left to claim "Login rejected" about a password that is gone.
  const update: Record<string, unknown> = {
    encrypted_password: encrypted,
    connection_status: 'disconnected',
    last_error: null,
  }
  const server = String(body.broker_server ?? '').trim()
  if (server) update.broker_server = server
  if (body.terminal_path !== undefined) {
    update.terminal_path = body.terminal_path ? String(body.terminal_path).trim() : null
  }

  const { error } = await admin.from('trading_accounts').update(update).eq('id', accountId)
  if (error) return json({ detail: error.message }, 500)

  await queueConnectionTest(userId, accountId)
  return json({ status: 'ok' })
}

async function createAccount(req: Request, body: Record<string, any>): Promise<Response> {
  const userId = await browserUser(req)
  if (!userId) return json({ detail: 'Not authenticated' }, 401)

  const accountNumber = String(body.account_number ?? '').trim()
  const brokerServer = String(body.broker_server ?? '').trim()
  const password = String(body.password ?? '')
  if (!accountNumber || !brokerServer || !password) {
    return json({ detail: 'account_number, broker_server and password are required' }, 422)
  }

  let encrypted: string
  try {
    encrypted = await encryptPassword(password)
  } catch (e) {
    return json({ detail: e instanceof Error ? e.message : String(e) }, 500)
  }

  const { data, error } = await admin.from('trading_accounts').insert({
    user_id: userId,
    platform: body.platform ?? 'mt5',
    account_number: accountNumber,
    broker_server: brokerServer,
    encrypted_password: encrypted,
    account_label: body.account_label ?? null,
    broker_slug: body.broker_slug ?? null,
    // Normally null: the worker claims a free terminal for this broker on the
    // first connection test. A value here is an explicit override from the
    // dialog's Advanced section, for a non-standard install.
    terminal_path: body.terminal_path ? String(body.terminal_path).trim() : null,
    api_base_url: body.api_base_url ?? null,
  }).select('id, account_number, broker_server, account_label, platform, connection_status').single()

  if (error) {
    // The unique index on (user_id, platform, account_number, broker_server).
    if (error.code === '23505') return json({ detail: 'That account is already connected.' }, 409)
    // A missing tc_users row is the one failure a user cannot act on, so name it.
    if (error.code === '23503') {
      return json({ detail: 'Your copier profile is missing. Sign out and back in, then try again.' }, 409)
    }
    return json({ detail: error.message }, 500)
  }

  await queueConnectionTest(userId, data.id)
  return json(data, 201)
}

/* ── Router ───────────────────────────────────────────────────────────────── */

/** Supabase serves this at /functions/v1/copier-gateway, and the worker appends
 * its own paths by plain string concatenation. Normalising on the function name
 * keeps routing correct whether or not the platform strips the prefix. */
function routePath(url: URL): string {
  const p = url.pathname
  const marker = '/copier-gateway'
  const at = p.indexOf(marker)
  return at === -1 ? p : p.slice(at + marker.length) || '/'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const url = new URL(req.url)
  const path = routePath(url)
  const method = req.method

  let body: Record<string, any> = {}
  if (method === 'POST') {
    try {
      body = await req.json()
    } catch {
      body = {}
    }
  }

  const respond = async (): Promise<Response> => {
    if (path === '/health' || path === '/') {
      return json({ status: 'ok', app: 'EagleCapital copier gateway', version: '1.0.0' })
    }

    if (path === '/accounts' && method === 'POST') return createAccount(req, body)

    const creds = path.match(/^\/accounts\/([^/]+)\/credentials$/)
    if (creds && method === 'POST') return updateCredentials(req, body, creds[1])

    if (path.startsWith('/internal/')) {
      const authFail = workerAuthError(req)
      if (authFail) return authFail

      // Routes that act on one user's book need to know which.
      const needsUser = path === '/internal/runtime-config'
        || path === '/internal/whoami'
        || path === '/internal/open-links'
        || path === '/internal/worker-commands'
        || path === '/internal/execution-events'
        || path === '/internal/execution-events/batch'
        || path.startsWith('/internal/trading-accounts/')
      const userId = actingUser(req)
      if (needsUser && !userId) {
        return json({ detail: [{ type: 'missing', loc: ['header', 'X-User-Id'], msg: 'Field required' }] }, 422)
      }

      if (path === '/internal/whoami' && method === 'GET') return whoami(userId!)
      if (path === '/internal/runtime-config' && method === 'GET') return getRuntimeConfig(userId!)
      if (path === '/internal/open-links' && method === 'GET') return getOpenLinks(userId!)
      if (path === '/internal/worker-commands' && method === 'GET') return pendingCommands(userId!)
      if (path === '/internal/workers/register' && method === 'POST') return registerWorker(req, body)
      if (path === '/internal/workers/heartbeat' && method === 'POST') return heartbeat(body)
      if (path === '/internal/workers/session-started' && method === 'POST') return sessionStarted(body)
      if (path === '/internal/workers/session-failed' && method === 'POST') return sessionFailed(body)
      if (path === '/internal/execution-events' && method === 'POST') return createEvent(body, userId!)
      if (path === '/internal/execution-events/batch' && method === 'POST') return createEventBatch(body, userId!)
      if (path === '/internal/account-balances' && method === 'POST') return updateBalances(body)
      if (path === '/internal/closed-trades' && method === 'POST') return journalClosedTrades(body)

      const trading = path.match(/^\/internal\/trading-accounts\/([^/]+)$/)
      if (trading && method === 'GET') {
        const { data: row } = await admin.from('trading_accounts').select('*')
          .eq('id', trading[1]).eq('user_id', userId!).maybeSingle()
        if (!row) return json({ detail: 'Account not found' }, 404)
        try {
          return json(await runtimeAccount(row, 'master'))
        } catch (e) {
          return json({ detail: `Credential decryption failed: ${e instanceof Error ? e.message : e}` }, 500)
        }
      }

      const complete = path.match(/^\/internal\/worker-commands\/([^/]+)\/complete$/)
      if (complete && method === 'POST') return completeCommand(complete[1], body)
    }

    return json({ detail: 'Not found' }, 404)
  }

  try {
    const res = await respond()
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v)
    return res
  } catch (e) {
    // Never let a stack trace reach a worker log verbatim — it can carry row
    // contents, and those rows hold broker credentials.
    console.error('copier-gateway error', e instanceof Error ? e.message : e)
    return json({ detail: 'Internal error' }, 500)
  }
})
