import styles from './Meter.module.css'

/**
 * "progress" mode: neutral — flat accent fill, no good/bad judgment (e.g. days elapsed).
 * "risk" mode: the pct represents room/limit *used* — good under 30%, warning to 70%, critical above.
 * "performance" mode: the inverse of risk — good above 70%, warning down to 30%, critical below.
 */
export function Meter({ label, pct, mode, rightLabel }: { label: string; pct: number; mode: 'progress' | 'risk' | 'performance'; rightLabel: string }) {
  const clamped = Math.max(0, Math.min(1, pct))
  const color =
    mode === 'progress'
      ? 'var(--accent)'
      : mode === 'performance'
        ? clamped > 0.7
          ? 'var(--good)'
          : clamped > 0.3
            ? 'var(--warning)'
            : 'var(--critical)'
        : clamped > 0.7
          ? 'var(--critical)'
          : clamped > 0.3
            ? 'var(--warning)'
            : 'var(--good)'

  return (
    <div className={styles.row}>
      <div className={styles.labels}>
        <span className={styles.label}>{label}</span>
        <span className={styles.rightLabel}>{rightLabel}</span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${clamped * 100}%`, background: color }} />
      </div>
    </div>
  )
}
