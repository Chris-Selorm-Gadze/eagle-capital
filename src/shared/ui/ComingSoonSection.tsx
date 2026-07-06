import type { ReactNode } from 'react'
import styles from './ComingSoonSection.module.css'

export function ComingSoonSection({ children }: { children: ReactNode }) {
  return (
    <div className={styles.root}>
      <div className={styles.title}>Coming soon</div>
      <div className={styles.description}>{children}</div>
    </div>
  )
}
