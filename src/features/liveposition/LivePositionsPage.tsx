import { createContext, memo, useContext, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AuthPage } from '../auth/AuthPage'
import {
  freshnessLabel,
  snapshotAgeSeconds,
  type LiveAccountPositions,
  type LivePosition,
} from '../../db/livePositions'
import { useLivePositions } from './useLivePositions'
import { accountUnrealized } from './totals'
import type { Tick } from './ticker'
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

/* One clock, read only by the cells that count up.
 *
 * Passing `now` down as a prop made every memo on this page dead weight: each
 * row re-rendered once a second to move one column, whether or not a price had
 * changed. Through a context, the tick reaches the age cells and nothing else,
 * so a row repaints when its numbers move and not otherwise. */
const ClockContext = createContext(0)

function Clock({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [])
  return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>
}

/** How long a position has been open, counting up on its own. */
function Elapsed({ openedAt }: { openedAt: string | null }) {
  return <span className={styles.num}>{formatDuration(openedAt, useContext(ClockContext))}</span>
}

/** How long ago the worker last read this account. */
function Freshness({ reportedAt, offline }: { reportedAt: string | null; offline: boolean }) {
  const age = snapshotAgeSeconds(reportedAt, useContext(ClockContext))
  // Past a minute the reading is old enough that the number beside it may not
  // be the position's real P&L any more, and the page should say so in colour
  // rather than leaving it to be read off a timestamp.
  const className = offline ? styles.offline : age !== null && age > 60 ? styles.stale : ''
  return <span className={className}>{offline ? 'disconnected' : freshnessLabel(age)}</span>
}

function pnlClass(n: number): string {
  if (n > 0) return styles.pnlGood
  if (n < 0) return styles.pnlBad
  return styles.pnlNeutral
}

/** A cell that flashes in the direction its number moved.
 *
 * State adjusted during render rather than refs mutated during render: this
 * tree runs under StrictMode, which renders twice, and a ref written on the
 * first pass makes the second pass see no change and drop the flash. React
 * supports this shape explicitly -- compare against the previous value held in
 * state, and set both when it differs.
 *
 * The flash is driven by a changing key rather than a class, because the same
 * direction arriving tick after tick would not restart a CSS animation that is
 * already on the element. */
function TickCell({ value, text, className }: {
  value: number | null
  text: string
  className?: string
}) {
  const [previous, setPrevious] = useState<number | null>(value)
  const [tick, setTick] = useState<{ direction: Tick; generation: number }>({
    direction: 'none',
    generation: 0,
  })

  if (value !== previous) {
    const direction = tickOf(previous, value)
    setPrevious(value)
    setTick((t) => (direction === 'none' ? t : { direction, generation: t.generation + 1 }))
  }

  const flash = tick.direction === 'up'
    ? styles.tickUp
    : tick.direction === 'down' ? styles.tickDown : ''
  return (
    <span className={`${styles.num} ${className ?? ''} ${flash}`} key={tick.generation}>
      {text}
    </span>
  )
}

const PositionRow = memo(function PositionRow({ position }: { position: LivePosition }) {
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
      <Elapsed openedAt={position.openedAt} />
      <TickCell
        value={position.unrealizedPnl}
        text={formatPnl(position.unrealizedPnl)}
        className={pnlClass(position.unrealizedPnl)}
      />
    </div>
  )
})

const AccountPanel = memo(function AccountPanel({ account }: { account: LiveAccountPositions }) {
  const offline = account.connectionStatus !== 'connected'
  const open = accountUnrealized(account)

  return (
    <div className={`card ${styles.accountCard}`}>
      <div className={styles.accountHeader}>
        <span className={styles.accountLabel}>{account.label}</span>
        <span className={styles.accountBroker}>{account.broker}</span>
        <div className={styles.accountBalances}>
          {account.positions.length > 0 && (
            <span>
              Open <strong className={pnlClass(open)}>{formatPnl(open)}</strong>
            </span>
          )}
          {account.equity !== null && <span>Equity <strong>{formatMoney(account.equity)}</strong></span>}
          {account.balance !== null && <span>Balance <strong>{formatMoney(account.balance)}</strong></span>}
          <Freshness offline={offline} reportedAt={account.reportedAt} />
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
            <PositionRow key={`${account.accountId}:${p.ticket}`} position={p} />
          ))}
        </div>
      )}
    </div>
  )
})

function LivePositionsWorkspace() {
  const { accounts, error, streaming, totals } = useLivePositions()

  if (accounts === null) {
    return error
      ? <div className={styles.error}>{error}</div>
      : <p style={{ color: 'var(--text-muted)' }}>Connecting to the live feed…</p>
  }

  return (
    <div>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.summaryRow}>
        {/* One pair per currency held. MT5 reports profit in each account's own
            currency, so a desk spanning two of them gets two subtotals rather
            than one figure denominated in neither. */}
        {totals.byCurrency.map((c) => (
          <div className={styles.summaryGroup} key={c.currency}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>
                Unrealized{totals.singleCurrency ? '' : ` · ${c.currency}`}
              </span>
              <span className={`${styles.summaryValue} ${pnlClass(c.unrealized)}`}>
                {formatPnl(c.unrealized)}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>
                Equity{totals.singleCurrency ? '' : ` · ${c.currency}`}
              </span>
              <span className={styles.summaryValue}>{formatMoney(c.equity)}</span>
            </div>
          </div>
        ))}
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Open</span>
          <span className={styles.summaryValue}>{totals.open}</span>
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
        <Clock>
          <div className={styles.accountGrid}>
            {accounts.map((a) => <AccountPanel account={a} key={a.accountId} />)}
          </div>
        </Clock>
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
