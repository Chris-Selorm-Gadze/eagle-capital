import { PieChart, Pie, Cell } from 'recharts'
import { TileShell } from './TileShell'

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.15rem' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
        <PieChart width={44} height={44} style={{ flexShrink: 0 }}>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={13} outerRadius={20} startAngle={90} endAngle={-270} stroke="none">
            {total > 0
              ? [<Cell key="w" fill="var(--good)" />, <Cell key="l" fill="var(--critical)" />]
              : [<Cell key="none" fill="var(--surface-2)" />]}
          </Pie>
        </PieChart>
      </div>
    </TileShell>
  )
}
