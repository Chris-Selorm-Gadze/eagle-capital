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

/* The broker's own words for the row, which is NOT always an error.
 *
 * The worker stores the MT5 retcode comment in `error_message` whether the order
 * succeeded or not -- there is only one text column -- so a perfectly good copy
 * carried the comment "Request executed". Rendering that in red under a green
 * "Copied" pill said two opposite things about the same row.
 *
 * So the message takes its colour from the status, never from the fact that the
 * field happens to be populated. */
const MESSAGE_TONE: Record<ExecutionStatus, string> = {
  success: 'msgGood',
  closed: 'msgGood',
  modified: 'msgGood',
  partial: 'msgWarn',
  pending: 'msgWarn',
  skipped_risk: 'msgWarn',
  skipped_slippage: 'msgWarn',
  duplicate_ignored: 'msgMuted',
  failed: 'msgBad',
  rejected: 'msgBad',
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

/** Where the milliseconds went, when the worker reported it.
 *
 * A switch of 0 is worth stating rather than hiding: it is the confirmation that
 * an account has its own terminal, and the number people are trying to get to. */
function latencyBreakdown(e: ExecutionEvent): string | null {
  const parts: string[] = []
  if (e.orderMs !== null) parts.push(`broker ${e.orderMs}`)
  if (e.switchMs !== null) parts.push(`switch ${e.switchMs}`)
  return parts.length > 0 ? parts.join(' · ') : null
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
                <td className={styles.num}>
                  {ms(e.e2eMs)}
                  {/* The breakdown is the only thing that answers "why is this
                      broker slower than that one". order_ms is the broker round
                      trip -- a floor set by network distance, which no local
                      change can improve. switch_ms is a login swap, which
                      giving the account its own terminal removes entirely.
                      Without these, a slow copy is indistinguishable from a
                      badly configured one. */}
                  {latencyBreakdown(e) && (
                    <div className={styles.breakdown}>{latencyBreakdown(e)}</div>
                  )}
                </td>
                <td>
                  <span className={`${styles.tone} ${styles[STATUS_TONE[e.status] ?? 'toneMuted']}`}>
                    {STATUS_LABEL[e.status] ?? e.status}
                  </span>
                  {e.errorMessage && (
                    <div className={`${styles.message} ${styles[MESSAGE_TONE[e.status] ?? 'msgMuted']}`}>
                      {e.errorMessage}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
