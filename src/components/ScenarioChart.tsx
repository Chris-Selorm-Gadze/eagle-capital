import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceDot } from 'recharts'
import { SCENARIOS } from '../domain/scenarios'

export function ScenarioChart({ actualFundedCapital, currentMonth }: { actualFundedCapital: number; currentMonth: string }) {
  const currentIndex = SCENARIOS.findIndex((p) => p.month === currentMonth)

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        Funded capital vs plan
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={SCENARIOS} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={50} />
          <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="conservative" stroke="#9ca3af" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="base" stroke="#2563eb" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="aggressive" stroke="#16a34a" dot={false} strokeWidth={2} />
          {currentIndex >= 0 && (
            <ReferenceDot
              x={currentMonth}
              y={actualFundedCapital}
              r={6}
              fill="#c00"
              stroke="none"
              label={{ value: 'Actual', position: 'top', fontSize: 11, fill: '#c00' }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
