import type { ReportCard, TradingRule } from '../../../types'
import styles from '../ReportCardPage.module.css'

export function ExecutionChecklist({
  card,
  rules,
  onChange,
}: {
  card: ReportCard
  // The user's own rules from Trader Management -> Rules, not a fixed generic list — the
  // checklist is only ever as long (and as relevant) as the rules each user has actually written.
  rules: TradingRule[]
  onChange: (patch: Partial<ReportCard>) => void
}) {
  function toggle(ruleId: string, checked: boolean) {
    onChange({ ruleChecks: { ...card.ruleChecks, [ruleId]: checked } })
  }

  return (
    <section className={styles.section} id="sec-execution">
      <div className={styles.secHead}>
        <span className={styles.secNum}>03</span>
        <h2>Execution Score</h2>
        <span className={styles.secNote}>This is your real grade</span>
      </div>
      {rules.length === 0 ? (
        <p className={styles.hint}>
          No rules yet — add your own under Trader Management → Rules to build a personalized checklist here.
        </p>
      ) : (
        <div className={styles.rules}>
          {rules.map((r) => (
            <div key={r.id} className={`${styles.ruleRow} ${r.isCore ? styles.ruleRowCore : ''}`}>
              <input
                type="checkbox"
                checked={card.ruleChecks?.[r.id!] ?? false}
                onChange={(e) => toggle(r.id!, e.target.checked)}
              />
              <span className={styles.ruleTxt}>{r.isCore ? <strong>{r.text}</strong> : r.text}</span>
              <span className={styles.ruleTag}>{r.isCore ? 'Core' : 'Rule'}</span>
            </div>
          ))}
        </div>
      )}
      <p className={styles.hint}>
        A day where you followed every rule and lost money is a good day. A day where you broke rules and made money
        is a bad day — it just paid you to do the wrong thing.
      </p>
    </section>
  )
}
