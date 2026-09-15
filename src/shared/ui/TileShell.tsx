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
          {/* tabIndex + role make the hover tooltip reachable by keyboard;
              aria-label carries the same text for screen readers, which would
              otherwise just announce the letter "i". */}
          {info && (
            <span aria-label={info} className="info-icon" data-tooltip={info} role="note" tabIndex={0}>
              i
            </span>
          )}
        </div>
        {badge !== undefined && <span className={styles.badge}>{badge}</span>}
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  )
}
