import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Account, SessionLog } from '../../../db/schema'
import { AXIS_LINE_STYLE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE, COLOR_ACCENT, COLOR_GRIDLINE } from '../../../utils/chartTheme'
import styles from './EquityCurveChart.module.css'

const TICK_STYLE = { fontSize: 10, fill: 'var(--text-muted)' }

export function EquityCurveChart({ account, sessions }: { account: Account; sessions: SessionLog[] }) {
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1))
  let running = account.size
  const data = sorted.map((s) => {
    running += s.pnl
    return { date: s.date, balance: running }
  })

  if (data.length === 0) return null

  return (
    <div className={`card ${styles.root}`}>
      <div className={styles.title}>{account.label}</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRIDLINE} />
          <XAxis dataKey="date" tick={TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE} />
          <YAxis
            tick={TICK_STYLE}
            axisLine={AXIS_LINE_STYLE}
            tickLine={AXIS_LINE_STYLE}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={45}
          />
          <Tooltip
            formatter={(v: number) => `$${v.toLocaleString()}`}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
          />
          <Line type="monotone" dataKey="balance" stroke={COLOR_ACCENT} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
