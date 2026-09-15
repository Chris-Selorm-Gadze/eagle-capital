import { latencySummary, type ExecutionEvent, type ExecutionStatus, type TradingAccount } from '../../../db/copier'
import styles from './ExecutionLog.module.css'

/* The copy log — what the worker actually did, and how fast.
 *
 * This is the trust surface of the whole product. A copier that claims to mirror
 * trades is unfalsifiable without it; with it, a trader can point at a row and
 * see the master ticket, the follower ticket, the slippage and the milliseconds.
 * It is also where a latency regression shows up first, which is why the timing
 * summary sits above the rows rather than buried in a report. */

const STATUS_TONE: Record<ExecutionStatus, string> = {
  success: 'toneGood',
  closed: 'toneGood',
  modified: 'toneGood',
  partial: 'toneWarn',
  pending: 'toneWarn',
  skipped_risk: 'toneWarn',
  skipped_slippage: 'toneWarn',
  duplicate_ignored: 'toneMuted',
  failed: 'toneBad',
  rejected: 'toneBad',
}

const STATUS_LABEL: Record<ExecutionStatus, string> = {
  success: 'Copied',
  closed: 'Closed',
  modified: 'Modified',
  partial: 'Partial fill',
  pending: 'In flight',
  skipped_risk: 'Blocked by risk',
  skipped_slippage: 'Slippage too high',
  duplicate_ignored: 'Duplicate',
  failed: 'Failed',
  rejected: 'Rejected by broker',
}

function ms(value: number | null): string {
  return value === null ? '—' : `${value} ms`
}

function shortTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function accountLabel(accounts: TradingAccount[], id: string | null): string {
  if (!id) return '—'
  const a = accounts.find((x) => x.id === id)
  if (!a) return 'deleted account'
  return a.label || `${a.platform} · ${a.accountNumber}`
}

export function ExecutionLog({ events, accounts }: { events: ExecutionEvent[]; accounts: TradingAccount[] }) {
  if (events.length === 0) {
    return (
      <p className={styles.empty}>
        No copy attempts recorded yet. Once a worker is running and a link is armed, every order it
        mirrors appears here with its timing.
      </p>
    )
  }

  const summary = latencySummary(events)

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Typical copy</span>
          <span className={styles.statValue}>{ms(summary.medianE2eMs)}</span>
          <span className={styles.statNote}>master fill → follower fill</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Worst</span>
          <span className={styles.statValue}>{ms(summary.worstE2eMs)}</span>
          <span className={styles.statNote}>over {summary.samples} timed cop{summary.samples === 1 ? 'y' : 'ies'}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Login switching</span>
          <span className={styles.statValue}>{ms(summary.medianSwitchMs)}</span>
          {/* The single most actionable number here: anything above zero means two
              accounts are sharing one MT5 install, and the worker is paying a
              login swap on every copy. */}
          <span className={styles.statNote}>
            {summary.medianSwitchMs === null || summary.medianSwitchMs === 0
              ? 'each account on its own terminal'
              : 'accounts share a terminal — give each its own install'}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Success rate</span>
          <span className={styles.statValue}>
            {summary.successRate === null ? '—' : `${Math.round(summary.successRate * 100)}%`}
          </span>
          <span className={styles.statNote}>of attempts that settled</span>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Follower</th>
              <th>Symbol</th>
              <th>Side</th>
              <th className={styles.numCol}>Lot</th>
              <th className={styles.numCol}>Slippage</th>
              <th className={styles.numCol}>Latency</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className={styles.num}>{shortTime(e.createdAt)}</td>
                <td>{accountLabel(accounts, e.followerAccountId)}</td>
                <td>
                  {e.symbolFollower ?? e.symbolMaster ?? '—'}
                  {/* A mapped symbol is worth showing: XAUUSD on the master can be
                      GOLD.m on the follower, and a mismatch here is a real failure
                      mode people otherwise debug blind. */}
                  {e.symbolMaster && e.symbolFollower && e.symbolMaster !== e.symbolFollower && (
                    <span className={styles.mapped}> ← {e.symbolMaster}</span>
                  )}
                </td>
                <td>{e.side ?? '—'}</td>
                <td className={styles.num}>{e.executedLot ?? e.requestedLot ?? '—'}</td>
                <td className={styles.num}>{e.slippagePoints ?? '—'}</td>
                <td className={styles.num}>{ms(e.e2eMs)}</td>
                <td>
                  <span className={`${styles.tone} ${styles[STATUS_TONE[e.status] ?? 'toneMuted']}`}>
                    {STATUS_LABEL[e.status] ?? e.status}
                  </span>
                  {e.errorMessage && <div className={styles.errorText}>{e.errorMessage}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
