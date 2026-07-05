import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts'
import type { Trade } from '../db/schema'

function hourOfDay(iso: string): number {
  const d = new Date(iso)
  return d.getHours() + d.getMinutes() / 60
}

export function TradeTimeScatter({ trades }: { trades: Trade[] }) {
  const wins = trades.filter((t) => t.pnl >= 0).map((t) => ({ hour: hourOfDay(t.entryTime), pnl: t.pnl, symbol: t.symbol }))
  const losses = trades.filter((t) => t.pnl < 0).map((t) => ({ hour: hourOfDay(t.entryTime), pnl: t.pnl, symbol: t.symbol }))

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', background: 'var(--surface)' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Trade time performance</div>
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2a" />
          <XAxis
            type="number" dataKey="hour" domain={[0, 24]} tickFormatter={(v) => `${v}:00`}
            tick={{ fontSize: 10, fill: '#898781' }} axisLine={{ stroke: '#383835' }} tickLine={{ stroke: '#383835' }}
            name="Time of day"
          />
          <YAxis
            type="number" dataKey="pnl" tickFormatter={(v) => `$${v.toLocaleString()}`}
            tick={{ fontSize: 10, fill: '#898781' }} axisLine={{ stroke: '#383835' }} tickLine={{ stroke: '#383835' }}
            name="P&L" width={60}
          />
          <ZAxis range={[40, 40]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(v: number, name: string) => (name === 'pnl' ? `$${v.toLocaleString()}` : v)}
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
