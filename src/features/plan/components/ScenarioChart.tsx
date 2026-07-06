import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceDot } from 'recharts'
import { SCENARIOS } from '../scenarios'
import {
  AXIS_LINE_STYLE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE,
  COLOR_GOOD, COLOR_ACCENT, COLOR_CRITICAL, COLOR_GRIDLINE,
} from '../../../utils/chartTheme'
import styles from './ScenarioChart.module.css'

const TICK_STYLE = { fontSize: 10, fill: 'var(--text-muted)' }
const LEGEND_STYLE = { fontSize: 12, color: 'var(--text-secondary)' }

export function ScenarioChart({ actualFundedCapital, currentMonth }: { actualFundedCapital: number; currentMonth: string }) {
  const currentIndex = SCENARIOS.findIndex((p) => p.month === currentMonth)

  return (
    <div className="card">
      <div className={styles.title}>Funded capital vs plan</div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={SCENARIOS} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRIDLINE} />
          <XAxis dataKey="month" tick={TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE} />
          <YAxis
            tick={TICK_STYLE}
            axisLine={AXIS_LINE_STYLE}
            tickLine={AXIS_LINE_STYLE}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={50}
          />
          <Tooltip
            formatter={(v: number) => `$${v.toLocaleString()}`}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
          />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Line type="monotone" dataKey="conservative" stroke="var(--text-muted)" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="base" stroke={COLOR_ACCENT} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="aggressive" stroke={COLOR_GOOD} dot={false} strokeWidth={2} />
          {currentIndex >= 0 && (
            <ReferenceDot
              x={currentMonth}
              y={actualFundedCapital}
              r={6}
              fill={COLOR_CRITICAL}
              stroke="none"
              label={{ value: 'Actual', position: 'top', fontSize: 11, fill: COLOR_CRITICAL }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
