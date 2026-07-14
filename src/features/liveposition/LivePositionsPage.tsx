import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AuthPage } from '../auth/AuthPage'
import { livePositionsConfigured, type LiveAccountPositions } from '../../lib/livePositionsClient'
import { subscribeLivePositions } from '../../lib/livePositionsSocket'
import styles from './LivePositionsPage.module.css'

function money(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString()}`
}

function pnlClass(n: number): string {
  if (n > 0) return styles.pnlGood
  if (n < 0) return styles.pnlBad
  return styles.pnlNeutral
}

function AccountPanel({ account }: { account: LiveAccountPositions }) {
  return (
    <div className={`card ${styles.accountCard}`}>
      <div className={styles.accountHeader}>
        <div>
          <span className={styles.accountLabel}>{account.label}</span>
          <span className={styles.accountBroker}>{account.broker}</span>
        </div>
        {account.balance !== null && account.equity !== null && (
          <div className={styles.accountBalances}>
            <span>Balance <strong>{money(account.balance)}</strong></span>
            <span>Equity <strong>{money(account.equity)}</strong></span>
          </div>
        )}
      </div>

      {account.error ? (
        <p className={styles.accountError}>{account.error}</p>
      ) : account.positions.length === 0 ? (
        <p className={styles.empty}>No open positions right now.</p>
      ) : (
        <div className={styles.positionList}>
          <div className={`${styles.positionRow} ${styles.positionHeaderRow}`}>
            <span>Symbol</span>
            <span>Side</span>
            <span>Qty</span>
            <span>Open</span>
            <span>Current</span>
            <span>P&amp;L</span>
          </div>
          {account.positions.map((p) => (
            <div key={p.positionId} className={styles.positionRow}>
              <span className={styles.positionSymbol}>{p.symbol}</span>
              <span className={p.side === 'long' ? styles.sideLong : styles.sideShort}>{p.side}</span>
              <span>{p.qty}</span>
              <span>{p.openPrice}</span>
              <span>{p.currentPrice ?? '—'}</span>
              <span className={pnlClass(p.unrealizedPnl)}>{money(p.unrealizedPnl)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LivePositionsWorkspace() {
  const [accounts, setAccounts] = useState<LiveAccountPositions[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeLivePositions(setAccounts, setError)
    return unsubscribe
  }, [])

  const loaded = accounts !== null
  const safeAccounts = accounts ?? []
  const totalPositions = safeAccounts.reduce((s, a) => s + a.positions.length, 0)
  const totalUnrealized = safeAccounts.reduce((s, a) => s + a.positions.reduce((s2, p) => s2 + p.unrealizedPnl, 0), 0)

  return (
    <div>
      {error && <div className={styles.error}>{error}</div>}

      {loaded && safeAccounts.length > 0 && (
        <div className={styles.summaryRow}>
          <span><strong>{safeAccounts.length}</strong> account{safeAccounts.length === 1 ? '' : 's'}</span>
          <span><strong>{totalPositions}</strong> open position{totalPositions === 1 ? '' : 's'}</span>
          <span className={pnlClass(totalUnrealized)}>Unrealized <strong>{money(totalUnrealized)}</strong></span>
        </div>
      )}

      {!loaded ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading live positions…</p>
      ) : safeAccounts.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          No connected accounts yet — add one from Broker Connections or the Trade Copier page to see live positions here.
        </p>
      ) : (
        <div className={styles.accountGrid}>
          {safeAccounts.map((a) => <AccountPanel key={a.connectionId} account={a} />)}
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
      <h1 className="page-title" style={{ marginBottom: '0.4rem' }}>Live Positions</h1>
      <p className={styles.hint}>
        Every connected account's open positions in one place — no toggling between accounts.
        Updates live as positions open, close, or move.
      </p>

      {!livePositionsConfigured && (
        <p className={styles.configNotice}>
          Broker sync isn't configured yet — set VITE_BROKER_SYNC_API_URL in .env.local for this page to actually work.
        </p>
      )}

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
