import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { DailyPnl } from '../../../utils/tradeAggregates'
import {
  AXIS_TICK_STYLE, AXIS_LINE_STYLE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE,
  COLOR_GOOD, COLOR_CRITICAL, COLOR_GRIDLINE,
} from '../../../utils/chartTheme'
import styles from './DailyPnlBarChart.module.css'

export function DailyPnlBarChart({ daily }: { daily: DailyPnl[] }) {
  return (
    <div className="card">
      <div className={styles.title}>Net daily P&amp;L</div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={daily}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRIDLINE} />
          <XAxis dataKey="date" tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE} />
          <YAxis tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE}
            tickFormatter={(v) => `$${v.toLocaleString()}`} width={64} />
          <Tooltip
            formatter={(v: number) => `$${v.toLocaleString()}`}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
          />
          <Bar dataKey="pnl">
            {daily.map((d, i) => (
              <Cell key={i} fill={d.pnl >= 0 ? COLOR_GOOD : COLOR_CRITICAL} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
