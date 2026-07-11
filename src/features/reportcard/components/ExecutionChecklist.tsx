import type { ReportCard } from '../../../types'
import { REPORT_CARD_RULES } from '../ruleDefinitions'
import styles from '../ReportCardPage.module.css'

export function ExecutionChecklist({
  card,
  onChange,
}: {
  card: ReportCard
  onChange: (patch: Partial<ReportCard>) => void
}) {
  return (
    <section className={styles.section} id="sec-execution">
      <div className={styles.secHead}>
        <span className={styles.secNum}>03</span>
        <h2>Execution Score</h2>
        <span className={styles.secNote}>This is your real grade</span>
      </div>
      <div className={styles.rules}>
        {REPORT_CARD_RULES.map((r) => (
          <div key={r.key} className={`${styles.ruleRow} ${r.core ? styles.ruleRowCore : ''}`}>
            <input type="checkbox" checked={card[r.key] ?? false} onChange={(e) => onChange({ [r.key]: e.target.checked })} />
            <span className={styles.ruleTxt}>{r.core ? <strong>{r.text}</strong> : r.text}</span>
            <span className={styles.ruleTag}>{r.core ? 'Core' : 'Rule'}</span>
          </div>
        ))}
      </div>
      <p className={styles.hint}>
        A day where you followed every rule and lost money is a good day. A day where you broke rules and made money
        is a bad day — it just paid you to do the wrong thing.
      </p>
    </section>
  )
}
