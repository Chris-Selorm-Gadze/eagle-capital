import type { ReactNode } from 'react'
import styles from './ParkedFeature.module.css'

/* A feature whose backend is deliberately not running.
 *
 * Distinct from ComingSoonSection, which promises something not built yet. This
 * is built, works, and is switched off — so the panel has to say what it did,
 * what to use instead, and (for a developer) how to bring it back. The previous
 * state showed each page's full UI with every button disabled behind a one-line
 * notice, which reads as a broken product rather than a parked one.
 *
 * The env var names are dev-only for the same reason `setupNotice` keeps them
 * dev-only: a deployed user cannot act on them and should not be shown how the
 * build is wired.
 */

export function ParkedFeature({
  what, instead, envVars = [],
}: {
  /** What the page did, in the past tense the reader needs. */
  what: ReactNode
  /** Where to go for the nearest live equivalent. Omit when there isn't one. */
  instead?: ReactNode
  envVars?: string[]
}) {
  const showDevHint = import.meta.env.DEV && envVars.length > 0

  return (
    <div className={styles.root}>
      <div className={styles.badge}>Parked</div>
      <p className={styles.what}>{what}</p>
      {instead && <p className={styles.instead}>{instead}</p>}
      {showDevHint && (
        <p className={styles.devHint}>
          Dev: set {envVars.join(', ')} in .env.local to bring this page back.
        </p>
      )}
    </div>
  )
}
