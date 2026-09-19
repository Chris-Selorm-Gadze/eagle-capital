import { selectAll } from './paginate'
import { listTradingAccounts, type ConnectionStatus, type TradingAccount } from './copier'

/* What is open right now, per account.
 *
 * Read straight from Postgres for the same reason the rest of db/copier.ts is:
 * RLS already scopes every row to auth.uid(), and Postgres is up when the
 * control plane is cold-starting. The worker writes these rows through the
 * gateway; nothing in the browser writes them.
 *
 * Every account carries its own reportedAt, and the page shows it. MT5 allows
 * one login per terminal, so the worker reads the account it is attached to and
 * nothing else: a master being copied is current, a follower nobody is copying
 * to was last seen on the balance sweep. One clock over all of them would be a
 * number the app cannot stand behind.
 */

export interface LivePosition {
  ticket: string
  symbol: string
  side: 'long' | 'short'
  volume: number
  openPrice: number | null
  currentPrice: number | null
  unrealizedPnl: number
  swap: number
  stopLoss: number | null
  takeProfit: number | null
  openedAt: string | null
}

export interface LiveAccountPositions {
  accountId: string
  label: string
  broker: string
  platform: string
  connectionStatus: ConnectionStatus
  balance: number | null
  equity: number | null
  currency: string | null
  positions: LivePosition[]
  /** When the worker last read this account. Null means it never has. */
  reportedAt: string | null
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** A stop or target level, where MT5's "none" is 0.0 rather than null. Kept
 * here as well as in the worker because rows written before that conversion
 * existed still hold zeros, and a target of $0 on screen reads as a real one. */
function level(value: unknown): number | null {
  const n = num(value)
  return n === null || n === 0 ? null : n
}

function positionFromJson(raw: Record<string, unknown>): LivePosition | null {
  const ticket = raw.ticket
  const symbol = raw.symbol
  if (!ticket || typeof symbol !== 'string' || !symbol) return null
  return {
    ticket: String(ticket),
    symbol,
    // Anything the worker did not label is shown as long rather than as a blank
    // cell; the side is always one of two things and a gap reads as a bug.
    side: raw.side === 'short' ? 'short' : 'long',
    volume: num(raw.volume) ?? 0,
    openPrice: num(raw.open_price),
    currentPrice: num(raw.current_price),
    unrealizedPnl: num(raw.unrealized_pnl) ?? 0,
    swap: num(raw.swap) ?? 0,
    stopLoss: level(raw.sl),
    takeProfit: level(raw.tp),
    openedAt: typeof raw.opened_at === 'number'
      ? new Date(raw.opened_at * 1000).toISOString()
      : null,
  }
}

export function positionsFromRow(row: Record<string, unknown>): LivePosition[] {
  const raw = row.positions
  if (!Array.isArray(raw)) return []
  return raw
    .map((p) => (p && typeof p === 'object' ? positionFromJson(p as Record<string, unknown>) : null))
    .filter((p): p is LivePosition => p !== null)
}

/** Accounts first, snapshots second, so an account the worker has never
 * reported still appears — as itself, awaiting a first read, rather than
 * vanishing from a page whose whole job is to show every account at once. */
export function mergeAccounts(
  accounts: TradingAccount[],
  snapshots: Record<string, unknown>[],
): LiveAccountPositions[] {
  const byAccount = new Map<string, Record<string, unknown>>()
  for (const row of snapshots) {
    const id = row.trading_account_id
    if (typeof id === 'string') byAccount.set(id, row)
  }

  return accounts.map((account) => {
    const snapshot = byAccount.get(account.id)
    return {
      accountId: account.id,
      label: account.label || account.accountNumber,
      broker: account.brokerServer,
      platform: account.platform,
      connectionStatus: account.connectionStatus,
      // The snapshot's figures are from the same visit as its positions, so
      // they agree with each other. Fall back to the account row only when
      // there is no snapshot at all.
      balance: snapshot ? num(snapshot.balance) ?? account.balance : account.balance,
      equity: snapshot ? num(snapshot.equity) ?? account.equity : account.equity,
      currency: (snapshot?.currency as string | null) ?? account.currency ?? null,
      positions: snapshot ? positionsFromRow(snapshot) : [],
      reportedAt: (snapshot?.reported_at as string | null) ?? null,
    }
  })
}

export async function listLivePositions(): Promise<LiveAccountPositions[]> {
  const [accounts, snapshots] = await Promise.all([
    listTradingAccounts(),
    selectAll('live_positions', { orderBy: 'trading_account_id' }),
  ])
  return mergeAccounts(accounts.filter((a) => a.isEnabled), snapshots)
}

/** Seconds since the worker last read this account, or null if it never has. */
export function snapshotAgeSeconds(reportedAt: string | null, now = Date.now()): number | null {
  if (!reportedAt) return null
  const at = Date.parse(reportedAt)
  if (!Number.isFinite(at)) return null
  return Math.max(0, Math.round((now - at) / 1000))
}

export function freshnessLabel(ageSeconds: number | null): string {
  if (ageSeconds === null) return 'not read yet'
  if (ageSeconds < 10) return 'live'
  if (ageSeconds < 60) return `${ageSeconds}s ago`
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ago`
  return `${Math.floor(ageSeconds / 3600)}h ago`
}
