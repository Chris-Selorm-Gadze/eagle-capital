import { PieChart, Pie, Cell } from 'recharts'
import { TileShell } from '../../../shared/ui/TileShell'
import { COLOR_GOOD, COLOR_CRITICAL } from '../../../utils/chartTheme'
import styles from './RatioRingTile.module.css'

export function RatioRingTile({
  label,
  info,
  value,
  grossWins,
  grossLosses,
}: {
  label: string
  info?: string
  value: string
  grossWins: number
  grossLosses: number
}) {
  const total = grossWins + grossLosses
  const data = total > 0 ? [{ value: grossWins }, { value: grossLosses }] : [{ value: 1 }]

  return (
    <TileShell label={label} info={info}>
      <div className={styles.row}>
        <div className={styles.value}>{value}</div>
        <PieChart width={44} height={44} className={styles.pieChart}>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={13} outerRadius={20} startAngle={90} endAngle={-270} stroke="none">
            {total > 0
              ? [<Cell key="w" fill={COLOR_GOOD} />, <Cell key="l" fill={COLOR_CRITICAL} />]
              : [<Cell key="none" fill="var(--surface-2)" />]}
          </Pie>
        </PieChart>
      </div>
    </TileShell>
  )
}
