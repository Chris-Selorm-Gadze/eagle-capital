import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { DailyPnl } from '../lib/tradeAggregates'

export function DailyPnlBarChart({ daily }: { daily: DailyPnl[] }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', background: 'var(--surface)' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Net daily P&amp;L</div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={daily}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2a" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#898781' }} axisLine={{ stroke: '#383835' }} tickLine={{ stroke: '#383835' }} />
          <YAxis tick={{ fontSize: 11, fill: '#898781' }} axisLine={{ stroke: '#383835' }} tickLine={{ stroke: '#383835' }}
            tickFormatter={(v) => `$${v.toLocaleString()}`} width={64} />
          <Tooltip
            formatter={(v: number) => `$${v.toLocaleString()}`}
            contentStyle={{ background: '#242422', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
            labelStyle={{ color: '#c3c2b7' }}
            itemStyle={{ color: '#ffffff' }}
          />
          <Bar dataKey="pnl">
            {daily.map((d, i) => (
              <Cell key={i} fill={d.pnl >= 0 ? '#0ca30c' : '#d03b3b'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
