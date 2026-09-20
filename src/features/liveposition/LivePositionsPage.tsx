import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AuthPage } from '../auth/AuthPage'
import {
  describeLoadFailure,
  freshnessLabel,
  listLivePositions,
  snapshotAgeSeconds,
  type LiveAccountPositions,
  type LivePosition,
} from '../../db/livePositions'
import styles from './LivePositionsPage.module.css'

/* Every connected account's open positions in one view.
 *
 * Refreshed on a timer rather than pushed. The limit on how fresh this page can
 * be is the worker, not the transport: MT5 allows one login per terminal, so an
 * account is only readable while the worker is attached to it. A socket would
 * deliver the same rows at the same age over a dependency the app does not
 * otherwise have. Each account therefore shows when it was last read.
 */
const REFRESH_MS = 3_000

function money(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString()}`
}

function price(n: number | null): string {
  return n === null ? '—' : String(n)
}

function pnlClass(n: number): string {
  if (n > 0) return styles.pnlGood
  if (n < 0) return styles.pnlBad
  return styles.pnlNeutral
}

function PositionRow({ position }: { position: LivePosition }) {
  return (
    <div className={styles.positionRow}>
      <span className={styles.positionSymbol}>{position.symbol}</span>
      <span className={position.side === 'long' ? styles.sideLong : styles.sideShort}>
        {position.side}
      </span>
      <span>{position.volume}</span>
      <span>{price(position.openPrice)}</span>
      <span>{price(position.currentPrice)}</span>
      <span className={pnlClass(position.unrealizedPnl)}>{money(position.unrealizedPnl)}</span>
    </div>
  )
}

function AccountPanel({ account, now }: { account: LiveAccountPositions; now: number }) {
  const age = snapshotAgeSeconds(account.reportedAt, now)
  const offline = account.connectionStatus !== 'connected'

  return (
    <div className={`card ${styles.accountCard}`}>
      <div className={styles.accountHeader}>
        <div>
          <span className={styles.accountLabel}>{account.label}</span>
          <span className={styles.accountBroker}>{account.broker}</span>
        </div>
        <div className={styles.accountBalances}>
          {account.balance !== null && <span>Balance <strong>{money(account.balance)}</strong></span>}
          {account.equity !== null && <span>Equity <strong>{money(account.equity)}</strong></span>}
          <span className={styles.accountBroker}>{freshnessLabel(age)}</span>
        </div>
      </div>

      {account.reportedAt === null ? (
        <p className={styles.empty}>
          {offline
            ? 'Not connected — the worker has not been able to read this account.'
            : 'Waiting for the worker’s first read of this account.'}
        </p>
      ) : account.positions.length === 0 ? (
        <p className={styles.empty}>No open positions.</p>
      ) : (
        <div className={styles.positionList}>
          <div className={`${styles.positionRow} ${styles.positionHeaderRow}`}>
            <span>Symbol</span>
            <span>Side</span>
            <span>Lots</span>
            <span>Open</span>
            <span>Current</span>
            <span>P&amp;L</span>
          </div>
          {account.positions.map((p) => <PositionRow key={p.ticket} position={p} />)}
        </div>
      )}
    </div>
  )
}

function LivePositionsWorkspace() {
  const [accounts, setAccounts] = useState<LiveAccountPositions[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // A refresh already in flight must not be stacked on by the next tick — a
  // slow round trip would otherwise queue requests faster than they return.
  const inFlight = useRef(false)
  // A failure no amount of retrying fixes — the migration being unrun is the
  // one that actually happens. Polling through it just prints a 404 every
  // three seconds behind a page that already said what is wrong.
  const [stopped, setStopped] = useState(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      setAccounts(await listLivePositions())
      setError(null)
    } catch (err) {
      const failure = describeLoadFailure(err)
      setError(failure.message)
      if (failure.fatal) setStopped(true)
    } finally {
      inFlight.current = false
      setNow(Date.now())
    }
  }, [])

  useEffect(() => {
    if (stopped) return
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer !== null) return
      void refresh()
      timer = setInterval(() => { void refresh() }, REFRESH_MS)
    }
    const stop = () => {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    }
    // A backgrounded tab polls nothing: the numbers are stale the moment it is
    // hidden, and resuming reads them fresh anyway.
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop())

    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [refresh, stopped])

  if (accounts === null) {
    return error
      ? <div className={styles.error}>{error}</div>
      : <p style={{ color: 'var(--text-muted)' }}>Loading live positions…</p>
  }

  const open = accounts.flatMap((a) => a.positions)
  const unrealized = open.reduce((sum, p) => sum + p.unrealizedPnl, 0)

  return (
    <div>
      {error && <div className={styles.error}>{error}</div>}

      {accounts.length > 0 && (
        <div className={styles.summaryRow}>
          <span><strong>{accounts.length}</strong> account{accounts.length === 1 ? '' : 's'}</span>
          <span><strong>{open.length}</strong> open position{open.length === 1 ? '' : 's'}</span>
          <span className={pnlClass(unrealized)}>Unrealized <strong>{money(unrealized)}</strong></span>
        </div>
      )}

      {accounts.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          No connected accounts yet — add one on the Trade Copier page and its open positions
          appear here.
        </p>
      ) : (
        <div className={styles.accountGrid}>
          {accounts.map((a) => <AccountPanel key={a.accountId} account={a} now={now} />)}
        </div>
      )}
    </div>
  )
}

export function LivePositionsPage() {
  const { user, loading } = useAuth()

  if (loading) return null

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '0.4rem' }}>Live Trading</h1>
      <p className={styles.hint}>
        Every connected account’s open positions in one place. Each account shows when the
        worker last read it — an account being copied is read every cycle, one that is idle is
        read on the balance sweep.
      </p>

      {!user ? (
        <>
          <p style={{ color: 'var(--text-secondary)' }}>Sign in to see your live positions.</p>
          <AuthPage />
        </>
      ) : (
        <LivePositionsWorkspace />
      )}
    </div>
  )
}
