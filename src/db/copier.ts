import { supabase } from '../lib/supabaseClient'
import { selectAll } from './paginate'

/* Trade copier data, read straight from Supabase.
 *
 * These tables (trading_accounts, copier_relations, execution_events, …) belong
 * to Delta Engine, the FastAPI + Windows-worker system that actually places the
 * orders. They used to live in a separate Supabase project, which meant a second
 * user identity and a second login; they now sit in this project alongside
 * everything else — see supabase/delta-engine-schema.sql for why and how.
 *
 * Reads come from here rather than from the control plane's REST API for two
 * reasons: RLS already scopes every row to auth.uid(), so there is nothing the
 * API adds to a plain SELECT; and the control plane is a single service that can
 * be cold-starting or down, while Postgres is the same dependency the rest of
 * the app already has. A user can therefore still see their accounts, their copy
 * links and their execution history when the worker or the API is unreachable —
 * which is exactly when they most want to look.
 *
 * Writes live in db/copierActions.ts. Most are plain RLS-scoped writes too;
 * the ones the WORKER must act on become rows in worker_commands, which it polls
 * outbound. Only account creation needs a server, because the broker password
 * has to be encrypted with a key the browser must never hold.
 */

export type Platform =
  | 'mt5' | 'mt4' | 'ctrader' | 'dxtrade' | 'matchtrader'
  | 'tradelocker' | 'ninjatrader' | 'tradingview' | 'tradovate'

export type ConnectionStatus =
  | 'connected' | 'disconnected' | 'auth_failed' | 'terminal_unavailable'
  | 'broker_unavailable' | 'disabled' | 'locked'

export type RiskMode = 'multiplier' | 'fixed_lot' | 'equity_ratio' | 'risk_percent'

export type ExecutionStatus =
  | 'pending' | 'success' | 'failed' | 'rejected' | 'skipped_risk'
  | 'skipped_slippage' | 'duplicate_ignored' | 'partial' | 'closed' | 'modified'

export interface TradingAccount {
  id: string
  platform: Platform
  accountNumber: string
  brokerServer: string
  label: string | null
  connectionStatus: ConnectionStatus
  balance: number | null
  equity: number | null
  currency: string | null
  isEnabled: boolean
  /** The per-account MT5 install. Two accounts sharing one path share one
   * terminal, and MT5 allows a single login per terminal — so the worker has to
   * swap logins between them. That swap is the `switch_ms` in every execution
   * event, and giving each account its own path is what removes it. */
  terminalPath: string | null
  lastConnectedAt: string | null
  lastError: string | null
}

export interface CopierRelation {
  id: string
  masterAccountId: string
  followerAccountId: string
  label: string | null
  riskMode: RiskMode
  multiplier: number
  fixedLotSize: number
  isEnabled: boolean
}

export interface RiskProfile {
  id: string
  accountId: string
  maxDailyLoss: number | null
  maxTotalLoss: number | null
  minEquity: number | null
  maxLotPerTrade: number | null
  maxOpenPositions: number
  maxTradesPerDay: number | null
  isLocked: boolean
  lockedReason: string | null
  dailyLossAccumulated: number
  dailyTradesCount: number
}

export interface ExecutionEvent {
  id: string
  copierRelationId: string | null
  masterAccountId: string | null
  followerAccountId: string | null
  eventType: string
  symbolMaster: string | null
  symbolFollower: string | null
  side: string | null
  requestedLot: number | null
  executedLot: number | null
  slippagePoints: number | null
  /** Login-swap cost. Zero once each account has its own terminal. */
  switchMs: number | null
  /** Broker round-trip. The floor, set by network distance to the broker. */
  orderMs: number | null
  /** Master fill to follower fill — the number that matters to a trader. */
  e2eMs: number | null
  status: ExecutionStatus
  errorMessage: string | null
  createdAt: string
}

export interface WorkerNode {
  id: string
  name: string
  region: string | null
  host: string | null
  status: string
  capacity: number
  activeSessions: number
  lastHeartbeatAt: string | null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function accountFromRow(row: Record<string, any>): TradingAccount {
  return {
    id: row.id,
    platform: row.platform,
    accountNumber: row.account_number,
    brokerServer: row.broker_server,
    label: row.account_label ?? null,
    connectionStatus: row.connection_status,
    balance: num(row.balance),
    equity: num(row.equity),
    currency: row.currency ?? null,
    isEnabled: row.is_enabled ?? true,
    terminalPath: row.terminal_path ?? null,
    lastConnectedAt: row.last_connected_at ?? null,
    lastError: row.last_error ?? null,
  }
}

export function relationFromRow(row: Record<string, any>): CopierRelation {
  return {
    id: row.id,
    masterAccountId: row.master_account_id,
    followerAccountId: row.follower_account_id,
    label: row.label ?? null,
    riskMode: row.risk_mode ?? 'multiplier',
    multiplier: num(row.multiplier) ?? 1,
    fixedLotSize: num(row.fixed_lot_size) ?? 0.01,
    isEnabled: row.is_enabled ?? false,
  }
}

export function riskProfileFromRow(row: Record<string, any>): RiskProfile {
  return {
    id: row.id,
    accountId: row.account_id,
    maxDailyLoss: num(row.max_daily_loss),
    maxTotalLoss: num(row.max_total_loss),
    minEquity: num(row.min_equity),
    maxLotPerTrade: num(row.max_lot_per_trade),
    maxOpenPositions: num(row.max_open_positions) ?? 0,
    maxTradesPerDay: num(row.max_trades_per_day),
    isLocked: row.is_locked ?? false,
    lockedReason: row.locked_reason ?? null,
    dailyLossAccumulated: num(row.daily_loss_accumulated) ?? 0,
    dailyTradesCount: num(row.daily_trades_count) ?? 0,
  }
}

export function eventFromRow(row: Record<string, any>): ExecutionEvent {
  return {
    id: row.id,
    copierRelationId: row.copier_relation_id ?? null,
    masterAccountId: row.master_account_id ?? null,
    followerAccountId: row.follower_account_id ?? null,
    eventType: row.event_type,
    symbolMaster: row.symbol_master ?? null,
    symbolFollower: row.symbol_follower ?? null,
    side: row.side ?? null,
    requestedLot: num(row.requested_lot),
    executedLot: num(row.executed_lot),
    slippagePoints: num(row.slippage_points),
    switchMs: num(row.switch_ms),
    orderMs: num(row.order_ms),
    e2eMs: num(row.e2e_ms),
    status: row.status,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
  }
}

export function workerFromRow(row: Record<string, any>): WorkerNode {
  return {
    id: row.id,
    name: row.worker_name,
    region: row.region ?? null,
    host: row.host_identifier ?? null,
    status: row.status ?? 'offline',
    capacity: num(row.capacity) ?? 0,
    activeSessions: num(row.active_sessions) ?? 0,
    lastHeartbeatAt: row.last_heartbeat_at ?? null,
  }
}

export async function listTradingAccounts(): Promise<TradingAccount[]> {
  return (await selectAll('trading_accounts', { orderBy: 'created_at' })).map(accountFromRow)
}

export async function listCopierRelations(): Promise<CopierRelation[]> {
  return (await selectAll('copier_relations', { orderBy: 'created_at' })).map(relationFromRow)
}

export async function listRiskProfiles(): Promise<RiskProfile[]> {
  return (await selectAll('risk_profiles', { orderBy: 'created_at' })).map(riskProfileFromRow)
}

export async function listWorkerNodes(): Promise<WorkerNode[]> {
  return (await selectAll('worker_nodes', { orderBy: 'created_at' })).map(workerFromRow)
}

/** Recent execution events only. Unlike every other list in this app this one is
 * deliberately NOT exhaustive — the table grows by one row per copied order per
 * follower and is an audit log, not a working set. The copy log shows the tail;
 * anything older is a reporting question, not a page-load question. */
export async function listRecentExecutionEvents(limit = 200): Promise<ExecutionEvent[]> {
  const { data, error } = await supabase
    .from('execution_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(eventFromRow)
}

/** A command the worker has not answered yet.
 *
 * Every button on this page that needs the broker touched — test a connection,
 * flatten an account — writes one of these and returns. Nothing else happens
 * until a worker polls. Showing the queue is what separates "waiting" from
 * "tried and failed": without it, an account whose test is still pending and an
 * account whose test was never picked up look identical, and both read as a
 * broken button.
 *
 * Deliberately not paginated. The worker drains this table, and
 * `testConnection` refuses to stack a second pending test on one account, so
 * the pending set is bounded by (accounts x command types) even with no worker
 * running at all.
 */
export interface PendingCommand {
  id: string
  accountId: string
  commandType: string
  createdAt: string
}

export async function listPendingCommands(): Promise<PendingCommand[]> {
  const { data, error } = await supabase
    .from('worker_commands')
    .select('id, trading_account_id, command_type, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    accountId: row.trading_account_id,
    commandType: row.command_type,
    createdAt: row.created_at,
  }))
}

/* ── Derived shapes ─────────────────────────────────────────────────────────
 * Pure functions below this line: no I/O, so they're directly testable. */

export interface CopierFollower {
  relation: CopierRelation
  account: TradingAccount
}

export interface CopierGroup {
  master: TradingAccount
  followers: CopierFollower[]
}

/** Groups copy links by their master account.
 *
 * A relation whose master or follower account is missing is dropped rather than
 * rendered with a placeholder: it means the account row was deleted while the
 * link survived, and showing half a link invites someone to "enable" a copier
 * pointing at nothing. */
export function buildCopierGroups(
  accounts: TradingAccount[],
  relations: CopierRelation[],
): CopierGroup[] {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const groups = new Map<string, CopierGroup>()

  for (const relation of relations) {
    const master = byId.get(relation.masterAccountId)
    const follower = byId.get(relation.followerAccountId)
    if (!master || !follower) continue

    let group = groups.get(master.id)
    if (!group) {
      group = { master, followers: [] }
      groups.set(master.id, group)
    }
    group.followers.push({ relation, account: follower })
  }

  return [...groups.values()].sort((a, b) =>
    (a.master.label ?? a.master.accountNumber).localeCompare(b.master.label ?? b.master.accountNumber),
  )
}

/** Accounts not participating in any copy link — the pool you can build a new
 * link from. */
export function unlinkedAccounts(accounts: TradingAccount[], relations: CopierRelation[]): TradingAccount[] {
  const used = new Set<string>()
  for (const r of relations) {
    used.add(r.masterAccountId)
    used.add(r.followerAccountId)
  }
  return accounts.filter((a) => !used.has(a.id))
}

export type WorkerLiveness = 'online' | 'stale' | 'offline'

/** The control plane expires a session after 120s without a heartbeat, and the
 * worker beats every 30s — so 120s is the point past which the server itself has
 * stopped believing the worker, and anything beyond two missed beats is already
 * worth a warning. */
export const HEARTBEAT_TTL_SECONDS = 120
const STALE_AFTER_SECONDS = 60

export function workerLiveness(lastHeartbeatAt: string | null, now: Date = new Date()): WorkerLiveness {
  if (!lastHeartbeatAt) return 'offline'
  const beat = new Date(lastHeartbeatAt).getTime()
  if (Number.isNaN(beat)) return 'offline'
  const ageSeconds = (now.getTime() - beat) / 1000
  if (ageSeconds >= HEARTBEAT_TTL_SECONDS) return 'offline'
  if (ageSeconds >= STALE_AFTER_SECONDS) return 'stale'
  return 'online'
}

/** Seconds since a worker last checked in, or null when it never has. Negative
 * ages (a worker clock running ahead of the browser's) clamp to 0 rather than
 * rendering as "-3s ago". */
export function heartbeatAgeSeconds(lastHeartbeatAt: string | null, now: Date = new Date()): number | null {
  if (!lastHeartbeatAt) return null
  const beat = new Date(lastHeartbeatAt).getTime()
  if (Number.isNaN(beat)) return null
  return Math.max(0, Math.round((now.getTime() - beat) / 1000))
}

export interface LatencySummary {
  samples: number
  medianE2eMs: number | null
  worstE2eMs: number | null
  medianSwitchMs: number | null
  successRate: number | null
}

/** Median rather than mean: copy latency has a long tail (a cold symbol, a
 * broker requote), and one 4-second outlier would drag an average into telling
 * you the system is slow when the typical copy was 40ms. The worst case is
 * reported alongside it rather than averaged away. */
export function latencySummary(events: ExecutionEvent[]): LatencySummary {
  const timed = events.filter((e) => e.e2eMs !== null)
  const e2e = timed.map((e) => e.e2eMs as number).sort((a, b) => a - b)
  const sw = events.filter((e) => e.switchMs !== null).map((e) => e.switchMs as number).sort((a, b) => a - b)

  const terminal = events.filter((e) => e.status === 'success' || e.status === 'failed' || e.status === 'rejected')
  const succeeded = terminal.filter((e) => e.status === 'success').length

  return {
    samples: e2e.length,
    medianE2eMs: median(e2e),
    worstE2eMs: e2e.length ? (e2e[e2e.length - 1] as number) : null,
    medianSwitchMs: median(sw),
    successRate: terminal.length ? succeeded / terminal.length : null,
  }
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] as number
  return Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2)
}

/** A copy link is only actually running if the link is armed AND both of its
 * accounts are connected. The page shows this rather than the link's own flag,
 * because "enabled" on a disconnected account copies nothing and saying
 * otherwise is how someone ends up believing they're hedged when they aren't. */
export function isRelationLive(relation: CopierRelation, master: TradingAccount, follower: TradingAccount): boolean {
  return relation.isEnabled
    && master.connectionStatus === 'connected'
    && follower.connectionStatus === 'connected'
}

/** Whether a connection test for this account is queued and unanswered. */
export function hasPendingTest(commands: PendingCommand[], accountId: string): boolean {
  return commands.some((c) => c.accountId === accountId && c.commandType === 'test_connection')
}

/** Is ANY worker alive enough to pick a queued command up?
 *
 * `stale` counts as yes: a worker one missed heartbeat behind is still polling,
 * and telling someone their command will never be answered when it will be a
 * few seconds late is the worse error. */
export function anyWorkerLive(workers: WorkerNode[], now: Date = new Date()): boolean {
  return workers.some((w) => workerLiveness(w.lastHeartbeatAt, now) !== 'offline')
}
