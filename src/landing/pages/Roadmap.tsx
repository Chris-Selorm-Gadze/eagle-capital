import { Reveal } from '../components/Reveal'
import { PageHeader } from '../components/PageHeader'
import { PageCta } from '../components/PageCta'
import { ROADMAP } from '../content'
import shared from './shared.module.css'
import styles from './Roadmap.module.css'

const STAGE_CLASS: Record<string, string> = {
  'In progress': styles.inProgress,
  Next: styles.next,
  Considering: styles.considering,
  Shipped: styles.shipped,
}

export function Roadmap() {
  return (
    <>
      <PageHeader
        eyebrow="Roadmap"
        title="What’s next."
        subhead="No dates, on purpose — an honest ordering is worth more than a promised quarter."
      />

      <section className={shared.body}>
        <div className="shell">
          <div className={styles.stages}>
            {ROADMAP.map((stage, i) => (
              <Reveal
                key={stage.stage}
                delay={i * 80}
                className={`${styles.stage} ${STAGE_CLASS[stage.stage] ?? ''}`}
              >
                <div className={styles.stageName}>{stage.stage}</div>
                <div className={styles.items}>
                  {stage.items.map((item) => (
                    <span
                      key={item}
                      className={`${styles.item} ${stage.stage === 'Shipped' ? styles.shippedItem : ''}`}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </Reveal>
            ))}
          </div>

          <PageCta label="Start free" note="Shipped features are available today." />
        </div>
      </section>
    </>
  )
}
