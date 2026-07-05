import { PieChart, Pie, Cell } from 'recharts'
import { TileShell } from './TileShell'

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {(value * 100).toFixed(2)}%
        </div>
        <PieChart width={84} height={46} style={{ flexShrink: 0 }}>
          <Pie
            data={data} dataKey="value" cx="50%" cy="100%"
            startAngle={180} endAngle={0} innerRadius={26} outerRadius={40}
            stroke="none"
          >
            {total > 0
              ? [<Cell key="w" fill="var(--good)" />, <Cell key="b" fill="var(--accent)" />, <Cell key="l" fill="var(--critical)" />]
              : [<Cell key="none" fill="var(--surface-2)" />]}
          </Pie>
        </PieChart>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', fontSize: '0.7rem', fontWeight: 600, marginTop: '-0.2rem' }}>
        <span style={{ color: 'var(--good)' }}>{wins}</span>
        <span style={{ color: 'var(--accent)' }}>{breakeven}</span>
        <span style={{ color: 'var(--critical)' }}>{losses}</span>
      </div>
    </TileShell>
  )
}
