import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceDot } from 'recharts'
import { SCENARIOS } from '../domain/scenarios'

export function ScenarioChart({ actualFundedCapital, currentMonth }: { actualFundedCapital: number; currentMonth: string }) {
  const currentIndex = SCENARIOS.findIndex((p) => p.month === currentMonth)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', background: 'var(--surface)' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        Funded capital vs plan
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={SCENARIOS} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2a" />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#898781' }} axisLine={{ stroke: '#383835' }} tickLine={{ stroke: '#383835' }} />
          <YAxis
            tick={{ fontSize: 10, fill: '#898781' }}
            axisLine={{ stroke: '#383835' }}
            tickLine={{ stroke: '#383835' }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={50}
          />
          <Tooltip
            formatter={(v: number) => `$${v.toLocaleString()}`}
            contentStyle={{ background: '#242422', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
            labelStyle={{ color: '#c3c2b7' }}
            itemStyle={{ color: '#ffffff' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#c3c2b7' }} />
          <Line type="monotone" dataKey="conservative" stroke="#898781" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="base" stroke="#3987e5" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="aggressive" stroke="#0ca30c" dot={false} strokeWidth={2} />
          {currentIndex >= 0 && (
            <ReferenceDot
              x={currentMonth}
              y={actualFundedCapital}
              r={6}
              fill="#d03b3b"
              stroke="none"
              label={{ value: 'Actual', position: 'top', fontSize: 11, fill: '#d03b3b' }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
