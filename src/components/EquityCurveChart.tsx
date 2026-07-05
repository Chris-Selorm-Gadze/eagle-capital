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
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem', minWidth: 280, height: 220 }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>{account.label}</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={45} />
          <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
          <Line type="monotone" dataKey="balance" stroke="#2563eb" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
