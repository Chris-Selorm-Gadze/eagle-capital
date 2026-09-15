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
    api_base_url: row.api_base_url ?? null,
    platform: String(row.platform ?? 'mt5'),
    enabled: row.is_enabled ?? true,
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
      await admin.from('trading_accounts').update({
        connection_status: 'connected',
        last_error: null,
        last_connected_at: nowIso(),
        balance: result.balance ?? null,
        equity: result.equity ?? null,
        currency: result.currency ?? null,
      }).eq('id', cmd.trading_account_id)
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

/* ── User-facing: create an account ───────────────────────────────────────── */

/** The only user-facing route here, because it is the only one that needs the
 * encryption key. Everything else the browser does — creating links, arming
 * them, queueing a flatten — is an RLS-scoped write it can make directly. */
async function createAccount(req: Request, body: Record<string, any>): Promise<Response> {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ detail: 'Not authenticated' }, 401)

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) return json({ detail: 'Invalid session' }, 401)
  const userId = userData.user.id

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
    terminal_path: body.terminal_path ?? null,
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

    if (path.startsWith('/internal/')) {
      const authFail = workerAuthError(req)
      if (authFail) return authFail

      // Routes that act on one user's book need to know which.
      const needsUser = path === '/internal/runtime-config'
        || path === '/internal/open-links'
        || path === '/internal/worker-commands'
        || path === '/internal/execution-events'
        || path === '/internal/execution-events/batch'
        || path.startsWith('/internal/trading-accounts/')
      const userId = actingUser(req)
      if (needsUser && !userId) {
        return json({ detail: [{ type: 'missing', loc: ['header', 'X-User-Id'], msg: 'Field required' }] }, 422)
      }

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
