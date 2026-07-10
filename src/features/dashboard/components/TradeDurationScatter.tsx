import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts'
import type { Trade } from '../../../db/schema'
import { tradeDurationMinutes } from '../../../utils/tradeStats'
import { formatDuration } from '../../../utils/format'
import {
  AXIS_TICK_STYLE, AXIS_LINE_STYLE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE,
  COLOR_GOOD, COLOR_CRITICAL, COLOR_GRIDLINE,
} from '../../../utils/chartTheme'
import styles from './TradeDurationScatter.module.css'

export function TradeDurationScatter({ trades }: { trades: Trade[] }) {
  const points = (list: Trade[]) =>
    list.map((t) => ({ duration: tradeDurationMinutes(t.entryTime, t.exitTime), pnl: t.pnl, symbol: t.symbol }))
  const wins = points(trades.filter((t) => t.pnl >= 0))
  const losses = points(trades.filter((t) => t.pnl < 0))

  return (
    <div className="card">
      <div className={styles.title}>Trade duration performance</div>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRIDLINE} />
          <XAxis
            type="number" dataKey="duration" tickFormatter={(v) => formatDuration(v)}
            tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE}
            name="Duration"
          />
          <YAxis
            type="number" dataKey="pnl" tickFormatter={(v) => `$${v.toLocaleString()}`}
            tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE}
            name="P&L" width={64}
          />
          <ZAxis range={[40, 40]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(v: number, name: string) => (name === 'pnl' ? `$${v.toLocaleString()}` : formatDuration(v))}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
          />
          <Scatter data={wins} fill={COLOR_GOOD} />
          <Scatter data={losses} fill={COLOR_CRITICAL} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
