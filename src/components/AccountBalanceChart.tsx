import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { BalancePoint } from '../lib/accountBalance'

export function AccountBalanceChart({ data }: { data: BalancePoint[] }) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', background: 'var(--surface)',
      display: 'flex', flexDirection: 'column', flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
        Account balance
        <span
          title="Starting allocation + cumulative trade P&L. Deposits / Withdrawals tracks cumulative payouts received."
          style={{
            cursor: 'help', color: 'var(--text-muted)', fontSize: '0.65rem', lineHeight: 1,
            border: '1px solid var(--text-muted)', borderRadius: '50%', width: 13, height: 13,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          i
        </span>
      </div>
      <div style={{ display: 'flex', gap: '1.25rem', margin: '0.6rem 0 0.25rem', fontSize: '0.8rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3987e5', display: 'inline-block' }} />
          Account Balance
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#d03b3b', display: 'inline-block' }} />
          Deposits / Withdrawals
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2a" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#898781' }} axisLine={{ stroke: '#383835' }} tickLine={{ stroke: '#383835' }} />
            <YAxis
              tick={{ fontSize: 10, fill: '#898781' }} axisLine={{ stroke: '#383835' }} tickLine={{ stroke: '#383835' }}
              tickFormatter={(v) => `$${v.toLocaleString()}`} width={64}
            />
            <Tooltip
              formatter={(v: number) => `$${v.toLocaleString()}`}
              contentStyle={{ background: '#242422', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
              labelStyle={{ color: '#c3c2b7' }}
              itemStyle={{ color: '#ffffff' }}
            />
            <Line type="monotone" dataKey="balance" name="Account Balance" stroke="#3987e5" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="withdrawals" name="Deposits / Withdrawals" stroke="#d03b3b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
