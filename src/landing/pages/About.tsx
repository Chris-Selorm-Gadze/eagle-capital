import { Reveal } from '../components/Reveal'
import { PageHeader } from '../components/PageHeader'
import { PageCta } from '../components/PageCta'
import styles from './shared.module.css'

export function About() {
  return (
    <>
      <PageHeader eyebrow="About" title="Built by someone who needed it." />

      <section className={styles.body}>
        <div className="shell">
          <Reveal>
            <div className={styles.prose}>
              <p>
                EagleCapital started as a spreadsheet for tracking prop-firm accounts, which became
                a dashboard, which became the thing you’re looking at. It was built by a trader
                running multiple accounts who got tired of four logins and a screenshots folder.
              </p>
              <p>
                That origin shows up in the product. There’s no rule engine, because a rule engine
                that’s wrong is worse than no rule engine. The pattern detection is deterministic,
                because a coach that says something different every time you ask isn’t a coach. The
                copier tells you what it can’t do before you find out at the fill.
              </p>
              <p>It’s a tool for doing the boring part of trading properly. That’s the whole pitch.</p>
            </div>
          </Reveal>

          <PageCta label="Start free" />
        </div>
      </section>
    </>
  )
}
