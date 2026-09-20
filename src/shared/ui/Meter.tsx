/**
 * A labelled progress bar with a judgment built into its colour.
 *
 * "progress" mode: neutral — flat accent fill, no good/bad judgment (e.g. days elapsed).
 * "risk" mode: the pct represents room/limit *used* — good under 30%, warning to 70%, critical above.
 * "performance" mode: the inverse of risk — good above 70%, warning down to 30%, critical below.
 *
 * Converted off its module stylesheet onto utilities and tokens. It also carries
 * real `progressbar` semantics now: it was a pair of divs, so a screen reader
 * got the label and the right-hand figure as loose text with no indication that
 * the bar between them meant anything.
 */
export function Meter({
  label,
  pct,
  mode,
  rightLabel,
}: {
  label: string
  pct: number
  mode: 'progress' | 'risk' | 'performance'
  rightLabel: string
}) {
  const clamped = Math.max(0, Math.min(1, pct))
  const color =
    mode === 'progress'
      ? 'var(--data-accent)'
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
    <div className="mb-2.5 last:mb-0">
      <div className="mb-1 flex justify-between gap-2 text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">{rightLabel}</span>
      </div>
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuetext={rightLabel}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div className="h-full rounded-full" style={{ background: color, width: `${clamped * 100}%` }} />
      </div>
    </div>
  )
}
