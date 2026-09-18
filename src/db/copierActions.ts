import { supabase } from '../lib/supabaseClient'
import {
  createAccount as createAccountViaGateway,
  updateCredentials as updateCredentialsViaGateway,
} from '../lib/copierGateway'
import { addAccount, deleteAccount } from './accounts'
import type { RiskMode } from './copier'

/* Everything the Trade Copier page changes.
 *
 * These used to be HTTP calls to a separate FastAPI service. Now that the
 * copier's tables live in this Supabase project, RLS already scopes every row
 * to auth.uid(), so a plain INSERT/UPDATE/DELETE is both simpler and safer than
 * a round trip through a service that would have made the same write with a
 * service-role key — there is no authorization the API was adding that the
 * database is not already enforcing.
 *
 * Two things still need a server, and only two:
 *   · creating an account, because the broker password must be encrypted with a
 *     key that can never reach a browser (lib/copierGateway.ts);
 *   · anything the worker must DO, which is queued as a worker_command and
 *     picked up on the worker's next outbound poll.
 */

/** Commands the worker actually implements. There is no start/stop session
 * command: the orchestrator's session endpoints write a `worker_sessions` row
 * the worker does not read yet, so offering those as buttons would be theatre.
 * `test_connection` is the real equivalent — it makes the worker log in and
 * report back what it found. */
export type WorkerCommandType = 'flatten' | 'test_connection' | 'reload_config'

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('Not signed in')
  return id
}

async function queueCommand(accountId: string, commandType: WorkerCommandType): Promise<void> {
  const userId = await currentUserId()
  const { error } = await supabase.from('worker_commands').insert({
    user_id: userId,
    trading_account_id: accountId,
    command_type: commandType,
    status: 'pending',
    payload: {},
  })
  if (error) throw error
}

/** Nudges the worker to re-read its config now instead of on its next cache
 * expiry. The worker refreshes on a short TTL anyway, so this is about the
 * difference between "immediately" and "within a second or two" — which matters
 * when the change being applied is *stop copying*. */
async function requestConfigReload(masterAccountId: string): Promise<void> {
  try {
    await queueCommand(masterAccountId, 'reload_config')
  } catch {
    // Best-effort. The copier row is already written and the worker will pick it
    // up on its own; failing the user's action because the nudge failed would be
    // worse than being a second late.
  }
}

/* ── Accounts ───────────────────────────────────────────────────────────── */

export interface NewCopierAccount {
  platform: string
  accountNumber: string
  brokerServer: string
  password: string
  label?: string
  brokerSlug?: string
  /** Optional override. Normally the worker assigns one. */
  terminalPath?: string
}

/** Goes through the gateway — the only write on this page that must, because
 * the password has to be encrypted server-side before it is stored. */
export async function connectAccount(input: NewCopierAccount): Promise<void> {
  await createAccountViaGateway({
    platform: input.platform,
    account_number: input.accountNumber,
    broker_server: input.brokerServer,
    password: input.password,
    account_label: input.label,
    broker_slug: input.brokerSlug,
    terminal_path: input.terminalPath,
  })
}

export async function updateAccount(
  accountId: string,
  patch: { label?: string | null; terminalPath?: string | null; isEnabled?: boolean },
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.label !== undefined) row.account_label = patch.label
  if (patch.terminalPath !== undefined) row.terminal_path = patch.terminalPath
  if (patch.isEnabled !== undefined) row.is_enabled = patch.isEnabled
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('trading_accounts').update(row).eq('id', accountId)
  if (error) throw error
}

/** Point a copier account at the dashboard account its trades should be
 * journalled against, or pass null to stop journalling it.
 *
 * A plain RLS-scoped update: `trading_accounts` has an "update own" policy, and
 * nothing here touches credentials, so it needs no gateway round trip.
 *
 * The unique index on account_id is what stops two copier accounts claiming one
 * dashboard account — six followers mirroring one master would otherwise each
 * write the same trade there and multiply its P&L. The error is surfaced as
 * plain language because "duplicate key value violates unique constraint" is
 * not an answer to anything.
 */
export async function linkJournalAccount(
  tradingAccountId: string,
  accountId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('trading_accounts')
    .update({ account_id: accountId })
    .eq('id', tradingAccountId)
  if (error) {
    if (error.code === '23505' || /duplicate key|unique constraint/i.test(error.message)) {
      throw new Error(
        'That dashboard account is already receiving trades from another connected account. '
        + 'Pick a different one, or create a new account for this.',
      )
    }
    throw error
  }
}

/** Create a dashboard account for a copier account, and link the two.
 *
 * Named from the broker account rather than asking the user to retype what the
 * copier already knows. Deliberately fills in NOTHING beyond identity and the
 * starting balance: max drawdown, daily loss limit and profit target are the
 * user's own numbers, because every firm's rules differ and a guessed default
 * reads as authoritative.
 *
 * `stage: 'live'` because a copier account is a real broker account. If it is
 * actually a prop-firm account, the dashboard's own account editor is where
 * that gets said — this does not try to infer it from the broker's name.
 */
export async function createJournalAccount(
  userId: string,
  account: {
    id: string
    label: string | null
    accountNumber: string
    platform: string
    balance: number | null
    currency: string | null
  },
): Promise<string> {
  const size = account.balance ?? 0
  const newAccountId = await addAccount(userId, {
    label: account.label || `${account.platform.toUpperCase()} · ${account.accountNumber}`,
    accountNumber: account.accountNumber,
    size,
    balance: size,
    highestBalance: size,
    currency: account.currency || 'USD',
    stage: 'live',
    active: true,
  })

  try {
    await linkJournalAccount(account.id, newAccountId)
  } catch (err) {
    // The dashboard account was created but could not be linked, which would
    // leave an orphan on the dashboard that never receives a trade. Undo it, so
    // a failed attempt leaves nothing behind to clean up by hand.
    await deleteAccount(newAccountId).catch(() => {})
    throw err
  }

  return newAccountId
}

export interface CredentialFix {
  password: string
  brokerServer?: string
  terminalPath?: string | null
}

/** Fixes a mistyped password (and the server, which fails the same way).
 *
 * Through the gateway, like creation, because the password has to be encrypted
 * server-side. Deleting and re-adding the account would also work and is what
 * you had to do before this existed — but it cascades, taking the account's copy
 * links, symbol mappings and risk limits with it. */
export async function fixCredentials(accountId: string, input: CredentialFix): Promise<void> {
  await updateCredentialsViaGateway(accountId, {
    password: input.password,
    broker_server: input.brokerServer,
    terminal_path: input.terminalPath,
  })
}

/** Deletes the account row. Cascades — see the confirmation text in the UI. */
export async function disconnectAccount(accountId: string): Promise<void> {
  const { error } = await supabase.from('trading_accounts').delete().eq('id', accountId)
  if (error) throw error
}

export type TestConnectionResult = 'queued' | 'already-pending'

/** Asks the worker to log in and report what it finds. This is the only honest
 * way to test a connection: the control plane cannot reach the broker, and the
 * browser certainly cannot — the worker is the thing holding the terminal.
 *
 * A second press while one is still pending is refused rather than queued. The
 * button completes instantly and the account keeps saying "Disconnected" until
 * a worker answers, so pressing it repeatedly is the natural response to it
 * looking broken — and every press is another MT5 login the worker will perform
 * the moment it starts. On a shared terminal those logins serialise, so six
 * impatient clicks become six sequential broker logins.
 *
 * The check is best-effort: two presses racing each other can still both insert.
 * That is one duplicate login, not a pile. */
export async function testConnection(accountId: string): Promise<TestConnectionResult> {
  const { data: existing, error: lookupError } = await supabase
    .from('worker_commands')
    .select('id')
    .eq('trading_account_id', accountId)
    .eq('command_type', 'test_connection')
    .eq('status', 'pending')
    .limit(1)
  if (lookupError) throw lookupError
  if (existing && existing.length > 0) return 'already-pending'

  await queueCommand(accountId, 'test_connection')
  return 'queued'
}

/* ── Copy links ─────────────────────────────────────────────────────────── */

export interface NewCopierLink {
  masterAccountId: string
  followerAccountId: string
  label?: string
  riskMode: RiskMode
  multiplier: number
  fixedLotSize?: number
}

/** Created disarmed, always.
 *
 * `is_enabled` defaults to TRUE in the upstream schema, which would mean a link
 * starts mirroring live orders the moment it is created. Creating a link and
 * turning it on are separate decisions, and only the second one needs to be
 * frightening. */
export async function createCopierLink(input: NewCopierLink): Promise<void> {
  const userId = await currentUserId()
  if (input.masterAccountId === input.followerAccountId) {
    throw new Error('An account cannot copy from itself.')
  }
  const { error } = await supabase.from('copier_relations').insert({
    user_id: userId,
    master_account_id: input.masterAccountId,
    follower_account_id: input.followerAccountId,
    label: input.label ?? null,
    risk_mode: input.riskMode,
    multiplier: input.multiplier,
    fixed_lot_size: input.fixedLotSize ?? 0.01,
    is_enabled: false,
  })
  if (error) {
    if (error.code === '23505') throw new Error('Those two accounts are already linked.')
    throw error
  }
}

export async function setCopierEnabled(
  relationId: string, masterAccountId: string, enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('copier_relations').update({ is_enabled: enabled }).eq('id', relationId)
  if (error) throw error
  await requestConfigReload(masterAccountId)
}

export async function deleteCopierLink(relationId: string, masterAccountId: string): Promise<void> {
  const { error } = await supabase.from('copier_relations').delete().eq('id', relationId)
  if (error) throw error
  await requestConfigReload(masterAccountId)
}

export async function updateCopierLink(
  relationId: string, masterAccountId: string,
  patch: { riskMode?: RiskMode; multiplier?: number; fixedLotSize?: number; label?: string | null },
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.riskMode !== undefined) row.risk_mode = patch.riskMode
  if (patch.multiplier !== undefined) row.multiplier = patch.multiplier
  if (patch.fixedLotSize !== undefined) row.fixed_lot_size = patch.fixedLotSize
  if (patch.label !== undefined) row.label = patch.label
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('copier_relations').update(row).eq('id', relationId)
  if (error) throw error
  await requestConfigReload(masterAccountId)
}

/* ── Risk / kill switch ─────────────────────────────────────────────────── */

/** Closes every open position on an account. Queued rather than called, because
 * only the worker can place the closing orders — but it is picked up on the
 * worker's command poll, which runs every couple of seconds. */
export async function flattenAccount(accountId: string): Promise<void> {
  await queueCommand(accountId, 'flatten')
}

export async function unlockRiskProfile(profileId: string): Promise<void> {
  const { error } = await supabase.from('risk_profiles').update({
    is_locked: false,
    locked_reason: null,
    locked_at: null,
  }).eq('id', profileId)
  if (error) throw error
}

export interface RiskLimits {
  maxDailyLoss?: number | null
  maxTotalLoss?: number | null
  minEquity?: number | null
  maxLotPerTrade?: number | null
  maxOpenPositions?: number | null
  maxTradesPerDay?: number | null
}

/** One profile per account — the unique index enforces it, so this upserts
 * rather than risking a duplicate when someone sets limits twice. */
export async function saveRiskLimits(accountId: string, limits: RiskLimits): Promise<void> {
  const userId = await currentUserId()
  const { error } = await supabase.from('risk_profiles').upsert({
    user_id: userId,
    account_id: accountId,
    max_daily_loss: limits.maxDailyLoss ?? null,
    max_total_loss: limits.maxTotalLoss ?? null,
    min_equity: limits.minEquity ?? null,
    max_lot_per_trade: limits.maxLotPerTrade ?? null,
    max_open_positions: limits.maxOpenPositions ?? 10,
    max_trades_per_day: limits.maxTradesPerDay ?? null,
  }, { onConflict: 'account_id' })
  if (error) throw error
}
