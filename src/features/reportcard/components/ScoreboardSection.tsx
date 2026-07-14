import type { ReportCard } from '../../../types'
import styles from '../ReportCardPage.module.css'

export function ScoreboardSection({
  card,
  onChange,
}: {
  card: ReportCard
  onChange: (patch: Partial<ReportCard>) => void
}) {
  return (
    <section className={styles.section} id="sec-scoreboard">
      <div className={styles.secHead}>
        <span className={styles.secNum}>01</span>
        <h2>Scoreboard</h2>
        <span className={styles.secNote}>Facts only. No story yet.</span>
      </div>
      <div className={styles.grid4}>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Trades taken</span>
          <input type="number" value={card.tradesTaken ?? ''} onChange={(e) => onChange({ tradesTaken: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="0" />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Wins</span>
          <input type="number" value={card.wins ?? ''} onChange={(e) => onChange({ wins: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="0" />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Losses</span>
          <input type="number" value={card.losses ?? ''} onChange={(e) => onChange({ losses: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="0" />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Net P&amp;L</span>
          <input type="text" value={card.netPnl ?? ''} onChange={(e) => onChange({ netPnl: e.target.value })} placeholder="$0" />
        </div>
      </div>
      <div className={styles.grid3}>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Largest win</span>
          <input type="text" value={card.largestWin ?? ''} onChange={(e) => onChange({ largestWin: e.target.value })} placeholder="$0" />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Largest loss</span>
          <input type="text" value={card.largestLoss ?? ''} onChange={(e) => onChange({ largestLoss: e.target.value })} placeholder="$0" />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Consecutive losses (max)</span>
          <input type="number" value={card.maxConsecutiveLosses ?? ''} onChange={(e) => onChange({ maxConsecutiveLosses: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="0" />
        </div>
      </div>
    </section>
  )
}
