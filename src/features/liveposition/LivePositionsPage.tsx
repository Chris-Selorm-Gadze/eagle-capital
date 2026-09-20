import { memo, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AuthPage } from '../auth/AuthPage'
import {
  freshnessLabel,
  snapshotAgeSeconds,
  type LiveAccountPositions,
  type LivePosition,
} from '../../db/livePositions'
import { useLivePositions } from './useLivePositions'
import {
  formatDuration,
  formatLots,
  formatMoney,
  formatPnl,
  formatPrice,
  tickOf,
} from './ticker'
import styles from './LivePositionsPage.module.css'

/* Every connected account's open positions, as they move.
 *
 * Rows arrive by Postgres realtime, so a snapshot reaches the screen when the
 * worker writes it rather than at the next poll. What the page can never do is
 * imply one freshness across all of it: MT5 allows one login per terminal, so
 * each account is as current as the last time the worker was attached to it,
 * and each says so.
 *
 * The clock ticks once a second on its own so ages and durations keep counting
 * between updates — without it a position that opened forty seconds ago would
 * read "40s" until the next price moved.
 */

function pnlClass(n: number): string {
  if (n > 0) return styles.pnlGood
  if (n < 0) return styles.pnlBad
  return styles.pnlNeutral
}

/** A cell that flashes in the direction its number moved.
 *
 * The flash is driven by a key change rather than a timer: re-keying restarts
 * the CSS animation, which a class toggle would not do when the same direction
 * repeats tick after tick. */
function TickCell({ value, text, className }: {
  value: number | null
  text: string
  className?: string
}) {
  const previous = useRef<number | null>(null)
  const generation = useRef(0)
  const direction = tickOf(previous.current, value)
  if (direction !== 'none') generation.current += 1
  previous.current = value

  const flash = direction === 'up' ? styles.tickUp : direction === 'down' ? styles.tickDown : ''
  return (
    <span className={`${styles.num} ${className ?? ''} ${flash}`} key={generation.current}>
      {text}
    </span>
  )
}

const PositionRow = memo(function PositionRow({
  position,
  now,
}: {
  position: LivePosition
  now: number
}) {
  return (
    <div className={styles.positionRow}>
      <span className={styles.positionSymbol}>{position.symbol}</span>
      <span className={position.side === 'long' ? styles.sideLong : styles.sideShort}>
        {position.side}
      </span>
      <span className={styles.num}>{formatLots(position.volume)}</span>
      <span className={styles.num}>{formatPrice(position.openPrice, position.digits)}</span>
      <TickCell
        value={position.currentPrice}
        text={formatPrice(position.currentPrice, position.digits)}
      />
      <span className={styles.num}>{formatDuration(position.openedAt, now)}</span>
      <TickCell
        value={position.unrealizedPnl}
        text={formatPnl(position.unrealizedPnl)}
        className={pnlClass(position.unrealizedPnl)}
      />
    </div>
  )
})

const AccountPanel = memo(function AccountPanel({
  account,
  now,
}: {
  account: LiveAccountPositions
  now: number
}) {
  const age = snapshotAgeSeconds(account.reportedAt, now)
  const offline = account.connectionStatus !== 'connected'
  // Past a minute the reading is old enough that the number on screen may not
  // be the position's real P&L any more, and the page should say so in colour
  // rather than leaving it to be read off a timestamp.
  const ageClass = offline ? styles.offline : age !== null && age > 60 ? styles.stale : ''

  return (
    <div className={`card ${styles.accountCard}`}>
      <div className={styles.accountHeader}>
        <span className={styles.accountLabel}>{account.label}</span>
        <span className={styles.accountBroker}>{account.broker}</span>
        <div className={styles.accountBalances}>
          {account.equity !== null && <span>Equity <strong>{formatMoney(account.equity)}</strong></span>}
          {account.balance !== null && <span>Balance <strong>{formatMoney(account.balance)}</strong></span>}
          <span className={ageClass}>{offline ? 'disconnected' : freshnessLabel(age)}</span>
        </div>
      </div>

      {account.reportedAt === null ? (
        <p className={styles.empty}>
          {offline
            ? 'Not connected — the worker has not been able to read this account.'
            : 'Waiting for the worker’s first read of this account.'}
        </p>
      ) : account.positions.length === 0 ? (
        <p className={styles.empty}>Flat.</p>
      ) : (
        <div className={styles.positionList}>
          <div className={`${styles.positionRow} ${styles.positionHeaderRow}`}>
            <span>Symbol</span>
            <span>Side</span>
            <span className={styles.num}>Lots</span>
            <span className={styles.num}>Entry</span>
            <span className={styles.num}>Last</span>
            <span className={styles.num}>Age</span>
            <span className={styles.num}>P&amp;L</span>
          </div>
          {account.positions.map((p) => (
            <PositionRow key={`${account.accountId}:${p.ticket}`} now={now} position={p} />
          ))}
        </div>
      )}
    </div>
  )
})

function LivePositionsWorkspace() {
  const { accounts, error, streaming, totals } = useLivePositions()
  const [now, setNow] = useState(() => Date.now())

  // Ages and durations count on their own between updates — without this a
  // position opened forty seconds ago would read "40s" until the next tick.
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(clock)
  }, [])

  if (accounts === null) {
    return error
      ? <div className={styles.error}>{error}</div>
      : <p style={{ color: 'var(--text-muted)' }}>Connecting to the live feed…</p>
  }

  return (
    <div>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.summaryRow}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Unrealized</span>
          <span className={`${styles.summaryValue} ${pnlClass(totals.unrealized)}`}>
            {formatPnl(totals.unrealized)}
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Open</span>
          <span className={styles.summaryValue}>{totals.open}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Equity</span>
          <span className={styles.summaryValue}>{formatMoney(totals.equity)}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Accounts</span>
          <span className={styles.summaryValue}>{totals.accounts}</span>
        </div>
        <span className={styles.streamState}>
          <span className={`${styles.streamDot} ${streaming ? styles.streamLive : ''}`} />
          {streaming ? 'streaming' : 'polling'}
        </span>
      </div>

      {accounts.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          No connected accounts yet — add one on the Trade Copier page and its open positions
          appear here.
        </p>
      ) : (
        <div className={styles.accountGrid}>
          {accounts.map((a) => <AccountPanel account={a} key={a.accountId} now={now} />)}
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
        Every connected account’s open positions, updating as they move. Each account shows
        when the worker last read it — one login can attach to a terminal at a time, so an
        account being copied is read continuously and an idle one on its own sweep.
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
