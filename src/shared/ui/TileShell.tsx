import type { ReactNode } from 'react'
import styles from './TileShell.module.css'

export function TileShell({
  label,
  info,
  badge,
  children,
}: {
  label: string
  info?: string
  badge?: string | number
  children: ReactNode
}) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.label}>
          {label}
          {info && <span title={info} className="info-icon">i</span>}
        </div>
        {badge !== undefined && <span className={styles.badge}>{badge}</span>}
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  )
}
