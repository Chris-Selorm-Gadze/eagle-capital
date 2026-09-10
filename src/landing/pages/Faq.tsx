import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { PageCta } from '../components/PageCta'
import { Reveal } from '../components/Reveal'
import { FAQ } from '../content'
import shared from './shared.module.css'
import styles from './Faq.module.css'

export function Faq() {
  // First answer open by default so the page never reads as a wall of
  // closed rows with nothing to look at.
  const [open, setOpen] = useState<number | null>(0)

  return (
    <>
      <PageHeader
        eyebrow="FAQ"
        title="Questions, answered straight."
        subhead="Including the ones where the answer is “no”."
      />

      <section className={shared.body}>
        <div className="shell">
          <Reveal className={styles.list}>
            {FAQ.map((f, i) => {
              const isOpen = open === i
              return (
                <div key={f.q} className={`${styles.item} ${isOpen ? styles.open : ''}`}>
                  <button
                    type="button"
                    className={styles.trigger}
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${i}`}
                  >
                    {f.q}
                    <span className={styles.sign} aria-hidden="true" />
                  </button>
                  <div className={styles.answer} id={`faq-answer-${i}`} role="region">
                    <div className={styles.answerInner}>
                      <p className={styles.answerText}>{f.a}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </Reveal>

          <PageCta label="Start free" note="Still have a question? It’s probably worth asking." />
        </div>
      </section>
    </>
  )
}
