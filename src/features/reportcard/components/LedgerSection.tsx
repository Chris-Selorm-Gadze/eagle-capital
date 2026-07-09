import type { ReportCard } from '../../../types'
import styles from '../ReportCardPage.module.css'

export function LedgerSection({
  card,
  onChange,
}: {
  card: ReportCard
  onChange: (patch: Partial<ReportCard>) => void
}) {
  return (
    <section className={styles.section}>
      <div className={styles.secHead}>
        <span className={styles.secNum}>05</span>
        <h2>The Ledger</h2>
        <span className={styles.secNote}>Two columns. Be honest in both.</span>
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <span className={styles.fieldKey}>What I did well</span>
          <textarea rows={4} value={card.didWell ?? ''} onChange={(e) => onChange({ didWell: e.target.value })} placeholder="Name at least one thing. Even on a red day." />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldKey}>What must improve tomorrow</span>
          <textarea rows={4} value={card.mustImprove ?? ''} onChange={(e) => onChange({ mustImprove: e.target.value })} placeholder="One thing. Not five. One." />
        </div>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldKey}>The A+ setup I passed on — and was right to</span>
        <textarea rows={2} value={card.passedSetup ?? ''} onChange={(e) => onChange({ passedSetup: e.target.value })} placeholder="Missing a trade with discipline is a win. Log it as one." />
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Am I allowed to trade tomorrow?</span>
          <select value={card.allowedTomorrow ?? ''} onChange={(e) => onChange({ allowedTomorrow: e.target.value })}>
            <option value="">—</option>
            <option>Yes</option>
            <option>No — sitting out</option>
            <option>Yes, but half size</option>
          </select>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldKey}>One sentence to tomorrow's me</span>
          <input type="text" value={card.noteToTomorrow ?? ''} onChange={(e) => onChange({ noteToTomorrow: e.target.value })} placeholder="Say the thing you'll need to hear at 09:30." />
        </div>
      </div>
    </section>
  )
}
