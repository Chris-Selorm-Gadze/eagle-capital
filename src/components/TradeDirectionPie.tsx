import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { Trade } from '../db/schema'
import { longPct as longFraction } from '../domain/tradeStats'
import { TileShell } from './TileShell'

export function TradeDirectionPie({ trades }: { trades: Trade[] }) {
  const longCount = trades.filter((t) => t.side === 'long').length
  const shortCount = trades.length - longCount
  const hasData = trades.length > 0
  const longPct = Math.round(longFraction(trades) * 100)

  const data = hasData
    ? [{ name: 'Long', value: longCount }, { name: 'Short', value: shortCount }]
    : [{ name: 'No trades', value: 1 }]

  return (
    <TileShell label="Trade direction" info="Share of trades taken long vs. short.">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.15rem' }}>
        <div style={{ width: 56, height: 56, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data} dataKey="value" nameKey="name"
                innerRadius={16} outerRadius={27} paddingAngle={hasData ? 3 : 0}
                stroke="var(--surface)" strokeWidth={2}
              >
                {hasData
                  ? [<Cell key="long" fill="var(--good)" />, <Cell key="short" fill="var(--critical)" />]
                  : [<Cell key="none" fill="var(--surface-2)" />]}
              </Pie>
              {hasData && (
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} trade${value === 1 ? '' : 's'}`, name]}
                  contentStyle={{ background: '#242422', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
                  labelStyle={{ color: '#c3c2b7' }}
                  itemStyle={{ color: '#ffffff' }}
                />
              )}
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--good)', display: 'inline-block' }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{longPct}%</span>
            <span style={{ color: 'var(--text-muted)' }}>Long</span>
          </div>
          <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--critical)', display: 'inline-block' }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{hasData ? 100 - longPct : 0}%</span>
            <span style={{ color: 'var(--text-muted)' }}>Short</span>
          </div>
        </div>
      </div>
    </TileShell>
  )
}
