import type { ReportCard, ReportCardGrade } from '../../../types'
import styles from '../ReportCardPage.module.css'

const GRADES: { key: ReportCardGrade; label: string; desc: string }[] = [
  { key: 'A', label: 'A', desc: 'Flawless process' },
  { key: 'B', label: 'B', desc: 'Minor slip' },
  { key: 'C', label: 'C', desc: 'Rules bent' },
  { key: 'R', label: 'R', desc: 'Revenge / tilt' },
]

const GRADE_CLASS: Record<ReportCardGrade, string> = {
  A: styles.stampA,
  B: styles.stampB,
  C: styles.stampC,
  R: styles.stampR,
}

export function GradeSection({
  card,
  onChange,
}: {
  card: ReportCard
  onChange: (patch: Partial<ReportCard>) => void
}) {
  return (
    <section className={styles.section} id="sec-grade">
      <div className={styles.secHead}>
        <span className={styles.secNum}>04</span>
        <h2>Grade the Day</h2>
        <span className={styles.secNote}>Process, not outcome</span>
      </div>
      <div className={styles.stamps}>
        {GRADES.map((g) => (
          <div
            key={g.key}
            className={`${styles.stamp} ${GRADE_CLASS[g.key]} ${card.grade === g.key ? styles.stampOn : ''}`}
            onClick={() => onChange({ grade: g.key })}
          >
            <span className={styles.g}>{g.label}</span>
            <span className={styles.d}>{g.desc}</span>
          </div>
        ))}
      </div>
      <div className={styles.field} style={{ marginTop: '18px' }}>
        <span className={styles.fieldKey}>Was I in a fit state to trade today?</span>
        <textarea
          rows={2}
          value={card.fitState ?? ''}
          onChange={(e) => onChange({ fitState: e.target.value })}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldKey}>Did I trade my plan, or my feelings?</span>
        <textarea
          rows={2}
          value={card.planOrFeelings ?? ''}
          onChange={(e) => onChange({ planOrFeelings: e.target.value })}
        />
      </div>
    </section>
  )
}
