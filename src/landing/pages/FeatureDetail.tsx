import { Link } from '../components/Link'
import { Reveal } from '../components/Reveal'
import { PageHeader } from '../components/PageHeader'
import { PageCta } from '../components/PageCta'
import { FEATURE_PAGES } from '../content'
import styles from './shared.module.css'

const BADGE_CLASS = {
  live: styles.badgeLive,
  blocked: styles.badgeBlocked,
  planned: styles.badgePlanned,
} as const

const BADGE_LABEL = { live: 'Live', blocked: 'Blocked', planned: 'Planned' } as const

/** One component for all nine feature pages — they share a structure, so the
 * differences live in content.ts rather than in nine near-identical files. */
export function FeatureDetail({ slug }: { slug: string }) {
  const feature = FEATURE_PAGES.find((f) => f.slug === slug)
  if (!feature) return null

  return (
    <>
      <PageHeader eyebrow={feature.eyebrow} title={feature.h1} subhead={feature.subhead} />

      <section className={styles.body}>
        <div className="shell">
          {feature.intro.length > 0 && (
            <Reveal>
              <div className={styles.prose}>
                {feature.intro.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </Reveal>
          )}

          {feature.bullets && (
            <Reveal>
              <div className={styles.bullets}>
                {feature.bullets.map((b, i) => (
                  <div
                    key={i}
                    className={`${styles.bullet} ${b.body ? styles.bulletPaired : ''}`}
                  >
                    <span className={styles.bulletLabel}>{b.label}</span>
                    {b.body && <span className={styles.bulletBody}>{b.body}</span>}
                  </div>
                ))}
              </div>
            </Reveal>
          )}

          {feature.aside && (
            <Reveal>
              <div className={styles.aside}>
                <div className={styles.asideTitle}>{feature.aside.title}</div>
                <p className={styles.asideBody}>{feature.aside.body}</p>
              </div>
            </Reveal>
          )}

          {feature.table && (
            <Reveal>
              <div className={styles.blockTitle} style={{ marginTop: '3rem' }}>
                Broker support status
              </div>
              <div className={styles.table}>
                {feature.table.map((r) => (
                  <div key={r.name} className={styles.row}>
                    <span className={styles.rowName}>{r.name}</span>
                    <span className={`${styles.badge} ${BADGE_CLASS[r.tone]}`}>
                      {BADGE_LABEL[r.tone]}
                    </span>
                    <span className={styles.rowStatus}>{r.status}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          )}

          {feature.extra && (
            <Reveal>
              <div className={styles.extra}>
                <h2 className={styles.extraTitle}>{feature.extra.title}</h2>
                <p className={styles.extraBody}>{feature.extra.body}</p>
              </div>
            </Reveal>
          )}

          <PageCta label={feature.cta} />

          <div className={styles.featureNav}>
            <div className={styles.blockTitle}>Other features</div>
            <div className={styles.featureNavGrid}>
              {FEATURE_PAGES.map((f) => (
                <Link
                  key={f.slug}
                  to={`/features/${f.slug}`}
                  className={`${styles.featureNavLink} ${f.slug === slug ? styles.current : ''}`}
                  aria-current={f.slug === slug ? 'page' : undefined}
                >
                  {f.nav}
                  <span className={styles.featureNavArrow} aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
