import styles from './ProductPreview.module.css'

/* Equity series for the hero preview. Hand-tuned to look like a real account:
 * net positive over the window, but with two genuine drawdowns and a flat
 * stretch. The copy deck explicitly warns against a fabricated perfect curve —
 * this is the visual equivalent of that instruction. */
const EQUITY = [
  0, 8, 5, 14, 21, 17, 26, 24, 33, 29, 22, 18, 25, 31, 38, 35, 44, 41, 39, 47,
  55, 51, 48, 58, 63, 59, 55, 62, 70, 74, 71, 79, 86, 82, 90,
]

const W = 320
const H = 84

function buildPath(values: number[]): { line: string; area: string } {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = W / (values.length - 1)

  const points = values.map((v, i) => {
    const x = i * step
    // Inset by 4px top and bottom so the stroke never clips at the edges.
    const y = H - 4 - ((v - min) / span) * (H - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return {
    line: `M ${points.join(' L ')}`,
    area: `M 0,${H} L ${points.join(' L ')} L ${W},${H} Z`,
  }
}

/** Mixed win/loss days — five reds in twenty-two sessions. */
const HEAT_DAYS = [1, 2, -1, 3, 1, 0, 2, -2, 1, 3, 2, -1, 1, 2, 3, -3, 1, 2, 1, -1, 3, 2]

function cellColor(v: number): string {
  if (v === 0) return 'rgba(255,255,255,0.07)'
  if (v < 0) return `rgba(224, 82, 82, ${0.35 + Math.min(Math.abs(v), 3) * 0.2})`
  return `rgba(74, 190, 105, ${0.35 + Math.min(v, 3) * 0.2})`
}

export function ProductPreview() {
  const { line, area } = buildPath(EQUITY)

  return (
    <div className={styles.viewport}>

      <div className={styles.chrome}>
        <div className={styles.chromeLeft}>
          <span className={styles.liveDot} />
          <span className={styles.chromeLabel}>Dashboard · all accounts</span>
        </div>
        <span className={styles.chromeLabel}>Last 35 sessions</span>
      </div>

      <div className={styles.screen}>
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>Net P&amp;L</div>
            <div className={`${styles.kpiValue} ${styles.pos}`}>+$4,182</div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>Win rate</div>
            <div className={styles.kpiValue}>54%</div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>Profit factor</div>
            <div className={styles.kpiValue}>1.38</div>
          </div>
        </div>

        <div className={styles.chartWrap}>
          <div className={styles.chartHead}>
            <span className={styles.chartLabel}>Cumulative P&amp;L</span>
            <span className={`${styles.chartLabel} ${styles.chartLabelGold}`}>4 accounts</span>
          </div>
          <svg
            className={styles.chart}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Cumulative profit and loss trending upward with two drawdowns"
          >
            <defs>
              <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(232,195,130,0.28)" />
                <stop offset="100%" stopColor="rgba(232,195,130,0)" />
              </linearGradient>
            </defs>
            <path className={styles.area} d={area} />
            <path className={styles.line} d={line} />
          </svg>
        </div>

        <div className={styles.heat}>
          <span className={styles.heatLabel}>Days</span>
          <div className={styles.heatCells} aria-hidden="true">
            {HEAT_DAYS.map((v, i) => (
              <span key={i} className={styles.cell} style={{ background: cellColor(v) }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
