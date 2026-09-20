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
          {/* A button, so the tooltip is reachable by keyboard and announced as
              something you can interact with — aria-label carries the text,
              which would otherwise be read as the single letter "i". It was a
              span with role="note" and a tabindex, which put a non-interactive
              role in the tab order and told screen readers it did nothing. */}
          {info && (
            <button aria-label={info} className="info-icon" data-tooltip={info} type="button">
              i
            </button>
          )}
        </div>
        {badge !== undefined && <span className={styles.badge}>{badge}</span>}
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  )
}
