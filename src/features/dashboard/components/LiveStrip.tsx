import { useLivePositions } from '../../liveposition/useLivePositions'
import { formatMoney, formatPnl } from '../../liveposition/ticker'
import styles from './LiveStrip.module.css'

/* Open risk, across every connected account, above the closed-trade history.
 *
 * Kept visibly separate from everything below it, and not folded into any of
 * it. The stats, the equity curve and the balance figure are built from closed
 * trades through utils/ledger.ts; unrealized P&L is neither realised nor
 * derivable from that ledger, and adding it to a balance would reintroduce
 * exactly the two-numbers-that-disagree problem the ledger exists to end.
 *
 * It renders nothing at all when no account is connected, rather than a row of
 * zeroes on a dashboard belonging to someone who only types trades in.
 */
export function LiveStrip() {
  const { accounts, streaming, totals } = useLivePositions()

  if (accounts === null || accounts.length === 0) return null

  const pnlClass = totals.unrealized > 0
    ? styles.good
    : totals.unrealized < 0 ? styles.bad : styles.flat

  return (
    <section className={styles.strip}>
      <div className={styles.item}>
        <span className={styles.label}>Open P&amp;L</span>
        <span className={`${styles.value} ${pnlClass}`}>{formatPnl(totals.unrealized)}</span>
      </div>
      <div className={styles.item}>
        <span className={styles.label}>Open positions</span>
        <span className={styles.value}>{totals.open}</span>
      </div>
      <div className={styles.item}>
        <span className={styles.label}>Equity</span>
        <span className={styles.value}>{formatMoney(totals.equity)}</span>
      </div>
      <div className={styles.item}>
        <span className={styles.label}>Connected</span>
        <span className={styles.value}>{totals.accounts}</span>
      </div>
      <span className={styles.state}>
        <span className={`${styles.dot} ${streaming ? styles.dotLive : ''}`} />
        {streaming ? 'live' : 'polling'}
      </span>
    </section>
  )
}
