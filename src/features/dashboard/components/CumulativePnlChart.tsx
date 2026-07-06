import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cumulativeSeries, type DailyPnl } from '../../../utils/tradeAggregates'
import {
  AXIS_TICK_STYLE, AXIS_LINE_STYLE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE,
  COLOR_GOOD, COLOR_CRITICAL, COLOR_GRIDLINE,
} from '../../../utils/chartTheme'
import styles from './CumulativePnlChart.module.css'

export function CumulativePnlChart({ daily }: { daily: DailyPnl[] }) {
  const data = cumulativeSeries(daily)
  const positive = (data.at(-1)?.cumulative ?? 0) >= 0
  const color = positive ? COLOR_GOOD : COLOR_CRITICAL

  return (
    <div className={`card ${styles.root}`}>
      <div className={styles.title}>Cumulative P&amp;L</div>
      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="cumulativePnlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <Area type="monotone" dataKey="cumulative" stroke={color} fill="url(#cumulativePnlFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
