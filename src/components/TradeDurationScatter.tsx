import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts'
import type { Trade } from '../db/schema'
import { tradeDurationMinutes } from '../domain/tradeStats'

export function TradeDurationScatter({ trades }: { trades: Trade[] }) {
  const points = (list: Trade[]) =>
    list.map((t) => ({ duration: tradeDurationMinutes(t.entryTime, t.exitTime), pnl: t.pnl, symbol: t.symbol }))
  const wins = points(trades.filter((t) => t.pnl >= 0))
  const losses = points(trades.filter((t) => t.pnl < 0))

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', background: 'var(--surface)' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Trade duration performance</div>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2a" />
          <XAxis
            type="number" dataKey="duration" tickFormatter={(v) => `${v}m`}
            tick={{ fontSize: 11, fill: '#898781' }} axisLine={{ stroke: '#383835' }} tickLine={{ stroke: '#383835' }}
            name="Duration (min)"
          />
          <YAxis
            type="number" dataKey="pnl" tickFormatter={(v) => `$${v.toLocaleString()}`}
            tick={{ fontSize: 11, fill: '#898781' }} axisLine={{ stroke: '#383835' }} tickLine={{ stroke: '#383835' }}
            name="P&L" width={64}
          />
          <ZAxis range={[40, 40]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(v: number, name: string) => (name === 'pnl' ? `$${v.toLocaleString()}` : `${v.toFixed(0)}m`)}
            contentStyle={{ background: '#242422', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
            labelStyle={{ color: '#c3c2b7' }}
            itemStyle={{ color: '#ffffff' }}
          />
          <Scatter data={wins} fill="#0ca30c" />
          <Scatter data={losses} fill="#d03b3b" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
