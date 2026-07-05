import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cumulativeSeries, type DailyPnl } from '../lib/tradeAggregates'

export function CumulativePnlChart({ daily }: { daily: DailyPnl[] }) {
  const data = cumulativeSeries(daily)
  const positive = (data.at(-1)?.cumulative ?? 0) >= 0
  const color = positive ? '#0ca30c' : '#d03b3b'

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', background: 'var(--surface)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Cumulative P&amp;L</div>
      <div style={{ flex: 1, minHeight: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="cumulativePnlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <Area type="monotone" dataKey="cumulative" stroke={color} fill="url(#cumulativePnlFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
