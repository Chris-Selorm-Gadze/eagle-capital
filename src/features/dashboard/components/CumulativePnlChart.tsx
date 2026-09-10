import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer } from 'recharts'
import { cumulativeSeries, type DailyPnl } from '../../../utils/tradeAggregates'
import {
  AXIS_TICK_STYLE, AXIS_LINE_STYLE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE,
  COLOR_GOOD, COLOR_CRITICAL, COLOR_GRIDLINE,
} from '../../../utils/chartTheme'
import styles from './CumulativePnlChart.module.css'

export function CumulativePnlChart({ daily }: { daily: DailyPnl[] }) {
  const data = cumulativeSeries(daily)
  const values = data.map((d) => d.cumulative)

  // Domain always includes 0 so the zero baseline is always on-chart, and so the gradient
  // offset below lines up with where 0 actually falls — not just the data's own min/max.
  const yMax = Math.max(0, ...values)
  const yMin = Math.min(0, ...values)
  const range = yMax - yMin
  // Fraction of the chart's height, from the top, where the value 0 sits — an all-positive
  // series pins this to 100% (all green), all-negative pins it to 0% (all red).
  const zeroOffset = range === 0 ? 0.5 : yMax / range

  return (
    <div className={`card ${styles.root}`}>
      <div className={styles.title}>Cumulative P&amp;L</div>
      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              {/* Fill fades in from the zero line toward each extreme, hard-switching color
                  (not blending) exactly at zero — same "glow near the curve" look as before,
                  just green above zero and red below instead of one color for the whole series. */}
              <linearGradient id="cumulativePnlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor={COLOR_GOOD} stopOpacity={0.35} />
                <stop offset={zeroOffset} stopColor={COLOR_GOOD} stopOpacity={0} />
                <stop offset={zeroOffset} stopColor={COLOR_CRITICAL} stopOpacity={0} />
                <stop offset={1} stopColor={COLOR_CRITICAL} stopOpacity={0.35} />
              </linearGradient>
              {/* Stroke gradient is exact (not an approximation) — each point on the line sits at
                  its own y-pixel row, so this colors every point by its own true sign. */}
              <linearGradient id="cumulativePnlStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={zeroOffset} stopColor={COLOR_GOOD} />
                <stop offset={zeroOffset} stopColor={COLOR_CRITICAL} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRIDLINE} />
            <XAxis dataKey="date" tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE} />
            <YAxis domain={[yMin, yMax]} tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE}
              tickFormatter={(v) => `$${v.toLocaleString()}`} width={50} />
            <Tooltip
              formatter={(v) => `$${Number(v).toLocaleString()}`}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            <ReferenceLine y={0} stroke={COLOR_GRIDLINE} />
            <Area type="monotone" dataKey="cumulative" baseValue={0} stroke="url(#cumulativePnlStroke)" fill="url(#cumulativePnlFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
