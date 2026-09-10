import { Link } from '../components/Link'
import { Reveal } from '../components/Reveal'
import { PageHeader } from '../components/PageHeader'
import { PageCta } from '../components/PageCta'
import { FEATURE_LAYERS, FEATURE_PAGES, TOOLS } from '../content'
import styles from './shared.module.css'

export function Features() {
  return (
    <>
      <PageHeader
        eyebrow="Features"
        title="Everything you need to run a trading business."
        subhead="Twelve tools, one login, no firm lock-in. All of it shipped."
      />

      <section className={styles.body}>
        <div className="shell">
          <Reveal>
            <div className={styles.prose}>
              <p>
                EagleCapital isn’t a dashboard with a journal bolted on. It’s four connected
                layers: track your accounts, capture your trades, review your behaviour, and
                execute across accounts. Each one feeds the next.
              </p>
            </div>
          </Reveal>

          <div className={`${styles.cards} ${styles.cards2}`}>
            {FEATURE_LAYERS.map((layer, i) => (
              <Reveal key={layer.name} delay={(i % 2) * 90}>
                <div className={`card ${styles.card}`}>
                  <div className={styles.blockTitle} style={{ marginBottom: '1rem' }}>
                    Layer {String(i + 1).padStart(2, '0')}
                  </div>
                  <h2 className={styles.cardTitle}>{layer.name}</h2>
                  <p className={styles.cardBody}>{layer.body}</p>
                  <div className="micro" style={{ marginTop: '1.25rem', lineHeight: 2 }}>
                    {layer.tools.join(' · ')}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <div className={styles.featureNav}>
            <Reveal>
              <div className={styles.blockTitle}>Read about each one</div>
              <div className={styles.featureNavGrid}>
                {FEATURE_PAGES.map((f) => (
                  <Link key={f.slug} to={`/features/${f.slug}`} className={styles.featureNavLink}>
                    {f.nav}
                    <span className={styles.featureNavArrow} aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </Reveal>
          </div>

          <div className={styles.featureNav}>
            <Reveal>
              <div className={styles.blockTitle}>All twelve tools</div>
              <div className={styles.bullets} style={{ maxWidth: 'none' }}>
                {TOOLS.map((t) => (
                  <div key={t.n} className={`${styles.bullet} ${styles.bulletPaired}`}>
                    <span className={styles.bulletLabel}>{t.name}</span>
                    <span className={styles.bulletBody}>{t.body}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <PageCta label="Start free" note="No card required." />
        </div>
      </section>
    </>
  )
}
