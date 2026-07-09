import type { ReportCard } from '../../../types'
import styles from '../ReportCardPage.module.css'

const WHYS: { key: 'why1' | 'why2' | 'why3' | 'why4' | 'why5'; n: number; q: string; prompt: string; rows: number }[] = [
  { key: 'why1', n: 1, q: 'Why did that happen?', prompt: 'Surface level. This will feel like the answer. It is not.', rows: 2 },
  { key: 'why2', n: 2, q: 'And why was that true?', prompt: 'Take your Why 1 answer and interrogate it.', rows: 2 },
  { key: 'why3', n: 3, q: 'And why was that?', prompt: 'This is where most people stop. Keep going.', rows: 2 },
  { key: 'why4', n: 4, q: 'And underneath that?', prompt: "It should be getting uncomfortable. That means it's working.", rows: 2 },
  { key: 'why5', n: 5, q: 'And finally — why?', prompt: "The honest answer here is almost never about price. It's about fear, need, pressure, or identity.", rows: 3 },
]

export function FiveWhysSection({
  card,
  onChange,
}: {
  card: ReportCard
  onChange: (patch: Partial<ReportCard>) => void
}) {
  return (
    <section className={styles.section}>
      <div className={styles.whys}>
        <div>
          <div className={styles.whysHeadTitle}>The 5 Whys</div>
          <p className={styles.whysHeadSub}>
            Take the single worst decision of the day — not the biggest loss, the worst <em>decision</em>. Then ask
            why five times. Each answer becomes the next question. Never stop at the first answer; the first answer
            is always a symptom. If your fifth Why is still about the market, you haven't dug deep enough — it should
            end at you.
          </p>
        </div>

        <div className={styles.problem}>
          <span className={styles.fieldKey}>The problem</span>
          <textarea
            rows={2}
            value={card.whyProblem ?? ''}
            onChange={(e) => onChange({ whyProblem: e.target.value })}
            placeholder="State the worst decision plainly. No excuses, no market blame."
          />
        </div>

        <div className={styles.drill}>
          {WHYS.map((w) => (
            <div key={w.key} className={styles.why} data-n={w.n}>
              <div className={styles.whyTag}>
                <span className={styles.n}>WHY {w.n}</span>
                <span className={styles.q}>{w.q}</span>
              </div>
              <textarea rows={w.rows} value={card[w.key] ?? ''} onChange={(e) => onChange({ [w.key]: e.target.value })} placeholder="Because…" />
              <p className={styles.whyPrompt}>{w.prompt}</p>
            </div>
          ))}
        </div>

        <div className={styles.rootBox}>
          <div className={styles.field} style={{ marginBottom: 0 }}>
            <span className={styles.fieldKey}>Root cause</span>
            <textarea
              rows={2}
              value={card.rootCause ?? ''}
              onChange={(e) => onChange({ rootCause: e.target.value })}
              placeholder="In one sentence: the real thing underneath all five."
            />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, marginTop: '14px' }}>
            <span className={styles.fieldKey}>The counter-measure — one rule, mechanical, testable</span>
            <textarea
              rows={2}
              value={card.counterMeasure ?? ''}
              onChange={(e) => onChange({ counterMeasure: e.target.value })}
              placeholder="Not 'be more patient.' Something a machine could check."
            />
            <p className={`${styles.whyPrompt} ${styles.fixHint}`}>If it needs willpower, it will fail. Build a rule that removes the choice.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
