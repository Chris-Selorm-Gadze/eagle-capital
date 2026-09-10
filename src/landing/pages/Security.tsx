import { Reveal } from '../components/Reveal'
import { PageHeader } from '../components/PageHeader'
import { PageCta } from '../components/PageCta'
import { SECURITY_BLOCKS, SECURITY_NEVER } from '../content'
import styles from './shared.module.css'

export function Security() {
  return (
    <>
      <PageHeader
        eyebrow="Security & data"
        title="How your data is handled."
        subhead="Plain language, because this page matters more than the hero."
      />

      <section className={styles.body}>
        <div className="shell">
          <div className={styles.bullets} style={{ marginTop: 0, maxWidth: '54rem' }}>
            {SECURITY_BLOCKS.map((b, i) => (
              <Reveal key={b.title} delay={i * 60} className={`${styles.bullet} ${styles.bulletPaired}`}>
                <span className={styles.bulletLabel}>{b.title}</span>
                <span className={styles.bulletBody}>{b.body}</span>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div className={styles.aside}>
              <div className={styles.asideTitle}>What we don’t do</div>
              <ul className={styles.asideBody} style={{ margin: '0.85rem 0 0', paddingLeft: '1.1rem' }}>
                {SECURITY_NEVER.map((n) => (
                  <li key={n} style={{ marginBottom: '0.5rem' }}>{n}</li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal>
            <div className={styles.extra}>
              <h2 className={styles.extraTitle}>Your control</h2>
              <p className={styles.extraBody}>
                Export your data whenever you want. Delete your account and it goes.
              </p>
            </div>
          </Reveal>

          <PageCta label="Create your account" />
        </div>
      </section>
    </>
  )
}
