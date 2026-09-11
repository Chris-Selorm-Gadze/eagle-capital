import { Reveal } from '../components/Reveal'
import { PageHeader } from '../components/PageHeader'
import {
  PRIVACY_SECTIONS,
  PRIVACY_UPDATED,
  TERMS_SECTIONS,
  TERMS_UPDATED,
  type LegalSection,
} from '../content'
import styles from './shared.module.css'

/* Privacy and Terms share a layout — a dated header and a run of headed
 * sections — so they share a component. The content lives in content.ts with
 * everything else the site says. */

function LegalPage({
  eyebrow,
  title,
  subhead,
  updated,
  sections,
}: {
  eyebrow: string
  title: string
  subhead: string
  updated: string
  sections: LegalSection[]
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} subhead={subhead} />

      <section className={styles.body}>
        <div className="shell">
          <Reveal>
            <p className={styles.legalUpdated}>Last updated {updated}</p>
          </Reveal>

          {sections.map((section) => (
            <Reveal key={section.heading}>
              <div className={styles.legalSection}>
                <h2 className={styles.legalHeading}>{section.heading}</h2>
                <div className={styles.prose}>
                  {section.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  )
}

export function Privacy() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy"
      subhead="What we collect, who else touches it, and how to take it back."
      updated={PRIVACY_UPDATED}
      sections={PRIVACY_SECTIONS}
    />
  )
}

export function Terms() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of service"
      subhead="The agreement between you and EagleCapital."
      updated={TERMS_UPDATED}
      sections={TERMS_SECTIONS}
    />
  )
}
