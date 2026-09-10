import { Reveal } from '../components/Reveal'
import { PageHeader } from '../components/PageHeader'
import { PageCta } from '../components/PageCta'
import styles from './shared.module.css'

const STEPS = [
  { n: '01', title: 'Create your account', body: 'Email and password. Nothing else. You’re in.' },
  {
    n: '02',
    title: 'Add your accounts',
    body: 'Pick your firm from the catalogue, or type in one we’ve never heard of — it works the same either way. Choose the stage (challenge, phase 2, verification, funded, PA, or your own live account) and enter your risk numbers: max drawdown, daily loss limit, profit target, minimum trading days. These are yours. We never fill them in for you.',
  },
  {
    n: '03',
    title: 'Get your history in',
    body: 'Three ways, mix freely. Import a CSV from your platform — safe to re-import. Connect a live MT5 account and let it sync. Or log trades by hand: one dialog, thirty seconds.',
  },
  {
    n: '04',
    title: 'Write your rules',
    body: 'Five to ten rules you actually intend to follow. These become your daily execution checklist.',
  },
  {
    n: '05',
    title: 'Review daily',
    body: 'Fill the report card at the close. Check the pattern flags weekly. Run a coaching digest monthly. That’s the whole loop.',
  },
]

export function HowItWorks() {
  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="From spreadsheet to trading desk in an afternoon."
        subhead="Setup takes an afternoon. The loop takes ten minutes a day. That’s the trade."
      />

      <section className={styles.body}>
        <div className="shell">
          <div className={styles.bullets} style={{ marginTop: 0, maxWidth: '54rem' }}>
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 60} className={`${styles.bullet} ${styles.bulletPaired}`}>
                <span className={styles.bulletLabel}>
                  <span className="micro" style={{ display: 'block', marginBottom: '0.5rem' }}>
                    Step {s.n}
                  </span>
                  {s.title}
                </span>
                <span className={styles.bulletBody}>{s.body}</span>
              </Reveal>
            ))}
          </div>

          <PageCta label="Start free" note="No card required." />
        </div>
      </section>
    </>
  )
}
