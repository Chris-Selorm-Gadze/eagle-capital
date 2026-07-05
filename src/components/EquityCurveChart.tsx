import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Account, SessionLog } from '../db/schema'

export function EquityCurveChart({ account, sessions }: { account: Account; sessions: SessionLog[] }) {
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1))
  let running = account.size
  const data = sorted.map((s) => {
    running += s.pnl
    return { date: s.date, balance: running }
  })

  if (data.length === 0) return null

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', minWidth: 280, height: 220, background: 'var(--surface)' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>{account.label}</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2a" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#898781' }} axisLine={{ stroke: '#383835' }} tickLine={{ stroke: '#383835' }} />
          <YAxis
            tick={{ fontSize: 10, fill: '#898781' }}
            axisLine={{ stroke: '#383835' }}
            tickLine={{ stroke: '#383835' }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={45}
          />
          <Tooltip
            formatter={(v: number) => `$${v.toLocaleString()}`}
            contentStyle={{ background: '#242422', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
            labelStyle={{ color: '#c3c2b7' }}
            itemStyle={{ color: '#ffffff' }}
          />
          <Line type="monotone" dataKey="balance" stroke="#3987e5" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
