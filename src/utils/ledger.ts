import type { Account, Payout, SessionLog, Trade } from '../types'
import { tradingDayOf } from './tradingDay'

/* The single definition of what an account is worth.
 *
 * There used to be two, and they never agreed:
 *
 *   · `accounts.balance`, a stored column mutated by logSession() and
 *     recordPayout() — but NOT by logging a trade.
 *   · `accountBalanceSeries()`, which computed size + cumulative trade P&L and
 *     ignored both sessions and the stored column.
 *
 * The dashboard handed one to a chart and the other to the header of the same
 * tile, so the curve and the number above it were drawn from different ledgers.
 * A user who only logged trades watched the curve climb while the header stayed
 * pinned at their starting allocation.
 *
 * Balance is now always DERIVED, never stored:
 *
 *     balance = size + realised P&L − withdrawals
 *
 * Sessions and trades are two ways of recording the same thing — a day's
 * result — so counting both would double-count. A day's trades win: a session
 * only contributes P&L on a date where that account has no logged trades. That
 * keeps both kinds of user honest (log every fill, or log a daily summary, or
 * switch from one to the other mid-account) without ever counting a dollar
 * twice.
 *
 * `accounts.balance` / `accounts.highest_balance` are now write-once at
 * creation and never read for display — see the note in db/accounts.ts.
 */

export interface AccountLedger {
  /** What the account started at. */
  openingBalance: number
  /** Realised P&L from logged trades. */
  tradePnl: number
  /** Realised P&L from session summaries, on days with no logged trades. */
  sessionPnl: number
  /** tradePnl + sessionPnl. */
  realizedPnl: number
  /** Payout amounts taken out of the account (the firm debits what you request). */
  withdrawn: number
  /** Payout amounts that actually reached the trader (after any profit split). */
  received: number
  /** openingBalance + realizedPnl − withdrawn. */
  balance: number
  /** Highest the balance has ever been — the reference a trailing drawdown
   * measures against. Never below the opening balance. */
  peakBalance: number
  /** Distinct days with any recorded activity (a trade or a session). */
  tradingDays: number
}

export interface LedgerPoint {
  date: string
  balance: number
  /** Cumulative payouts received as of this date. */
  withdrawals: number
}

/** One day's movement on one account. */
interface DayMovement {
  pnl: number
  withdrawn: number
  received: number
}

function emptyLedger(openingBalance: number): AccountLedger {
  return {
    openingBalance,
    tradePnl: 0,
    sessionPnl: 0,
    realizedPnl: 0,
    withdrawn: 0,
    received: 0,
    balance: openingBalance,
    peakBalance: openingBalance,
    tradingDays: 0,
  }
}

/** Groups one account's activity by trading day. Exported for the series
 * builders below and for tests; callers normally want `buildLedger`. */
export function dayMovements(
  trades: Trade[],
  sessions: SessionLog[],
  payouts: Payout[],
): Map<string, DayMovement> {
  const days = new Map<string, DayMovement>()
  const ensure = (date: string): DayMovement => {
    let d = days.get(date)
    if (!d) {
      d = { pnl: 0, withdrawn: 0, received: 0 }
      days.set(date, d)
    }
    return d
  }

  // Trades first, so the set of trade-days is known before sessions are folded in.
  const tradeDays = new Set<string>()
  for (const t of trades) {
    const date = tradingDayOf(t.entryTime)
    if (!date) continue
    tradeDays.add(date)
    ensure(date).pnl += t.pnl
  }

  for (const s of sessions) {
    // A session is a summary of the same day the trades already describe.
    // Counting both would double it, so the finer-grained record wins.
    if (tradeDays.has(s.date)) continue
    ensure(s.date).pnl += s.pnl
  }

  for (const p of payouts) {
    const d = ensure(p.date)
    d.withdrawn += p.requested
    d.received += p.received
  }

  return days
}

/** Everything derivable about one account, from its own trades/sessions/payouts. */
export function buildLedger(
  account: Account,
  trades: Trade[],
  sessions: SessionLog[],
  payouts: Payout[],
): AccountLedger {
  const ledger = emptyLedger(account.size)
  const days = dayMovements(trades, sessions, payouts)

  const tradeDays = new Set<string>()
  for (const t of trades) {
    const date = tradingDayOf(t.entryTime)
    if (!date) continue
    tradeDays.add(date)
    ledger.tradePnl += t.pnl
  }
  for (const s of sessions) {
    if (!tradeDays.has(s.date)) ledger.sessionPnl += s.pnl
  }

  ledger.realizedPnl = ledger.tradePnl + ledger.sessionPnl
  for (const p of payouts) {
    ledger.withdrawn += p.requested
    ledger.received += p.received
  }
  ledger.balance = ledger.openingBalance + ledger.realizedPnl - ledger.withdrawn

  // Peak has to walk the days in order — the highest the balance ever reached
  // isn't max(opening, final), it's the running maximum along the way.
  let running = ledger.openingBalance
  let peak = running
  for (const date of [...days.keys()].sort()) {
    const d = days.get(date)!
    running += d.pnl - d.withdrawn
    if (running > peak) peak = running
  }
  ledger.peakBalance = peak

  const activeDays = new Set<string>(tradeDays)
  for (const s of sessions) activeDays.add(s.date)
  ledger.tradingDays = activeDays.size

  return ledger
}

/** Ledgers for every account, keyed by account id. Computed once per render of
 * the app shell and passed down, so no component has to re-derive it. */
export function buildLedgers(
  accounts: Account[],
  trades: Trade[],
  sessions: SessionLog[],
  payouts: Payout[],
): Map<string, AccountLedger> {
  const tradesBy = groupBy(trades, (t) => t.accountId)
  const sessionsBy = groupBy(sessions, (s) => s.accountId)
  const payoutsBy = groupBy(payouts, (p) => p.accountId)

  const out = new Map<string, AccountLedger>()
  for (const a of accounts) {
    if (a.id === undefined) continue
    out.set(a.id, buildLedger(a, tradesBy.get(a.id) ?? [], sessionsBy.get(a.id) ?? [], payoutsBy.get(a.id) ?? []))
  }
  return out
}

function groupBy<T>(items: T[], key: (item: T) => string | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    if (k === undefined) continue
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

/** Balance over time across a set of accounts, for the dashboard chart.
 *
 * Starts from the combined opening balance so the curve and the current-balance
 * figure beside it are the same arithmetic — previously the curve summed only
 * accounts that had trades while the figure summed every account in the filter,
 * so three accounts with one traded drew a curve off by two allocations. */
export function balanceSeries(
  accounts: Account[],
  trades: Trade[],
  sessions: SessionLog[],
  payouts: Payout[],
): LedgerPoint[] {
  const opening = accounts.reduce((sum, a) => sum + a.size, 0)

  const combined = new Map<string, DayMovement>()
  for (const a of accounts) {
    if (a.id === undefined) continue
    const days = dayMovements(
      trades.filter((t) => t.accountId === a.id),
      sessions.filter((s) => s.accountId === a.id),
      payouts.filter((p) => p.accountId === a.id),
    )
    for (const [date, mv] of days) {
      const existing = combined.get(date)
      if (existing) {
        existing.pnl += mv.pnl
        existing.withdrawn += mv.withdrawn
        existing.received += mv.received
      } else {
        combined.set(date, { ...mv })
      }
    }
  }

  let balance = opening
  let received = 0
  return [...combined.keys()].sort().map((date) => {
    const mv = combined.get(date)!
    balance += mv.pnl - mv.withdrawn
    received += mv.received
    return { date, balance, withdrawals: received }
  })
}

/** One day's realised P&L for one account, under the same rule the ledger uses:
 * if that day has logged trades they are the answer, otherwise the session
 * summary is. Used for "daily loss limit used today". */
export function pnlOnDay(trades: Trade[], sessions: SessionLog[], date: string): number {
  const dayTrades = trades.filter((t) => tradingDayOf(t.entryTime) === date)
  if (dayTrades.length > 0) return dayTrades.reduce((sum, t) => sum + t.pnl, 0)
  return sessions.filter((s) => s.date === date).reduce((sum, s) => sum + s.pnl, 0)
}

/** Combined current balance across a set of accounts. */
export function totalBalance(accounts: Account[], ledgers: Map<string, AccountLedger>): number {
  return accounts.reduce((sum, a) => sum + (a.id ? (ledgers.get(a.id)?.balance ?? a.size) : a.size), 0)
}
