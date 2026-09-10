import { Link } from '../components/Link'
import { Reveal } from '../components/Reveal'
import { PageHeader } from '../components/PageHeader'
import { PRICING_TIERS, PRICING_FAQ } from '../content'
import shared from './shared.module.css'
import styles from './Pricing.module.css'

export function Pricing() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Start free. Pay when you connect a real broker."
        subhead="The free tier is the whole journal, dashboard and prop tracker — it runs on your own data, so it costs us almost nothing to give you."
      />

      <section className={shared.body}>
        <div className="shell">
          <div className={styles.tiers}>
            {PRICING_TIERS.map((t, i) => (
              <Reveal key={t.name} delay={i * 90}>
                <div className={`card ${styles.tier} ${t.featured ? styles.featured : ''}`}>
                  {t.featured && <span className={styles.badge}>Most popular</span>}
                  <h2 className={styles.name}>{t.name}</h2>
                  <div className={styles.priceRow}>
                    <span className={styles.price}>{t.price}</span>
                    {t.period && <span className={styles.period}>{t.period}</span>}
                  </div>
                  <p className={styles.forWho}>{t.forWho}</p>
                  <div className={styles.includes}>
                    {t.includes.map((inc) => (
                      <span key={inc} className={styles.item}>
                        <span className={styles.tick} aria-hidden="true" />
                        {inc}
                      </span>
                    ))}
                  </div>
                  <Link
                    to="/signup"
                    className={`${t.featured ? 'btnInk' : 'btnGhost'} ${styles.tierCta}`}
                  >
                    {t.cta}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Paid pricing isn't set and there's no billing in the product yet.
              Saying so plainly beats publishing a number we'd have to walk back. */}
          <Reveal>
            <div className={styles.notice}>
              <div className={styles.noticeTitle}>On the paid tiers</div>
              <p className={styles.noticeBody}>
                Pricing for Connected and Desk isn’t final, and billing isn’t live yet. The free
                tier is available today and isn’t going anywhere. Join the waitlist and you’ll hear
                the numbers before anyone is charged.
              </p>
            </div>
          </Reveal>

          <div className={styles.faq}>
            <Reveal>
              <div className={shared.blockTitle}>Pricing questions</div>
              {PRICING_FAQ.map((f) => (
                <div key={f.q} className={styles.faqItem}>
                  <h3 className={styles.faqQ}>{f.q}</h3>
                  <p className={styles.faqA}>{f.a}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </section>
    </>
  )
}
