import { Reveal } from '../components/Reveal'
import { PageHeader } from '../components/PageHeader'
import { DISCLAIMER_BODY } from '../content'
import styles from './shared.module.css'

export function Disclaimer() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Risk disclaimer"
        subhead="Read this before you connect a live account or enable the copier."
      />

      <section className={styles.body}>
        <div className="shell">
          <Reveal>
            <div className={styles.prose}>
              {DISCLAIMER_BODY.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </Reveal>

          <Reveal>
            <div className={styles.aside}>
              <div className={styles.asideTitle}>Privacy, in short</div>
              <p className={styles.asideBody}>
                Your trades are yours. They’re scoped to your user ID at the database level. We
                don’t sell data, we don’t share it with prop firms, and we don’t need your broker
                password unless you connect an account. Analytics identify you by user ID only,
                with no session replay. You can export everything and delete your account whenever
                you want.
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
