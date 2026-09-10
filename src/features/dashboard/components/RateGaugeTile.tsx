import { PieChart, Pie, Cell } from 'recharts'
import { TileShell } from '../../../shared/ui/TileShell'
import { COLOR_GOOD, COLOR_ACCENT, COLOR_CRITICAL } from '../../../utils/chartTheme'
import styles from './RateGaugeTile.module.css'

const RADIAN = Math.PI / 180

// recharts 3 types every field on a Pie label renderer's props as optional
// (and the radii as number | string), so these must be optional here too or the
// renderer isn't assignable to `PieLabel`. Values are coerced at point of use.
interface PieLabelProps {
  cx?: number | string
  cy?: number | string
  midAngle?: number
  innerRadius?: number | string
  outerRadius?: number | string
  index?: number
}

// Places each slice's raw count directly on its own arc segment (at the slice's angular
// midpoint, halfway between the inner and outer radius) instead of a disconnected legend row
// below the gauge — the number physically sits where its color actually appears.
function renderCountLabel(counts: number[]) {
  return ({ cx, cy, midAngle, innerRadius, outerRadius, index }: PieLabelProps) => {
    const value = counts[index ?? 0]
    if (!value) return null
    const inner = Number(innerRadius ?? 0)
    const outer = Number(outerRadius ?? 0)
    const radius = inner + (outer - inner) / 2
    const angle = Number(midAngle ?? 0)
    const x = Number(cx ?? 0) + radius * Math.cos(-angle * RADIAN)
    const y = Number(cy ?? 0) + radius * Math.sin(-angle * RADIAN)
    return (
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="var(--page-bg)">
        {value}
      </text>
    )
  }
}

export function RateGaugeTile({
  label,
  info,
  value,
  wins,
  breakeven,
  losses,
}: {
  label: string
  info?: string
  value: number // 0-1
  wins: number
  breakeven: number
  losses: number
}) {
  const total = wins + breakeven + losses
  const data = total > 0
    ? [{ value: wins }, { value: breakeven }, { value: losses }]
    : [{ value: 1 }]

  return (
    <TileShell label={label} info={info}>
      <div className={styles.row}>
        <div className={styles.value}>{(value * 100).toFixed(2)}%</div>
        <PieChart width={84} height={46} className={styles.pieChart}>
          <Pie
            data={data} dataKey="value" cx="50%" cy="100%"
            startAngle={180} endAngle={0} innerRadius={26} outerRadius={40}
            stroke="none"
            label={total > 0 ? renderCountLabel([wins, breakeven, losses]) : undefined}
            labelLine={false}
            isAnimationActive={false}
          >
            {total > 0
              ? [<Cell key="w" fill={COLOR_GOOD} />, <Cell key="b" fill={COLOR_ACCENT} />, <Cell key="l" fill={COLOR_CRITICAL} />]
              : [<Cell key="none" fill="var(--surface-2)" />]}
          </Pie>
        </PieChart>
      </div>
    </TileShell>
  )
}
