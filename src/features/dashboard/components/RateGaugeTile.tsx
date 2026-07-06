import { PieChart, Pie, Cell } from 'recharts'
import { TileShell } from '../../../shared/ui/TileShell'
import { COLOR_GOOD, COLOR_ACCENT, COLOR_CRITICAL } from '../../../utils/chartTheme'
import styles from './RateGaugeTile.module.css'

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
          >
            {total > 0
              ? [<Cell key="w" fill={COLOR_GOOD} />, <Cell key="b" fill={COLOR_ACCENT} />, <Cell key="l" fill={COLOR_CRITICAL} />]
              : [<Cell key="none" fill="var(--surface-2)" />]}
          </Pie>
        </PieChart>
      </div>
      <div className={styles.counts}>
        <span className={styles.winCount}>{wins}</span>
        <span className={styles.beCount}>{breakeven}</span>
        <span className={styles.lossCount}>{losses}</span>
      </div>
    </TileShell>
  )
}
