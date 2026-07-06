import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts'
import type { Trade } from '../../../db/schema'
import {
  AXIS_TICK_STYLE, AXIS_LINE_STYLE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE,
  COLOR_GOOD, COLOR_CRITICAL, COLOR_GRIDLINE,
} from '../../../utils/chartTheme'
import styles from './TradeTimeScatter.module.css'

function hourOfDay(iso: string): number {
  const d = new Date(iso)
  return d.getHours() + d.getMinutes() / 60
}

export function TradeTimeScatter({ trades }: { trades: Trade[] }) {
  const wins = trades.filter((t) => t.pnl >= 0).map((t) => ({ hour: hourOfDay(t.entryTime), pnl: t.pnl, symbol: t.symbol }))
  const losses = trades.filter((t) => t.pnl < 0).map((t) => ({ hour: hourOfDay(t.entryTime), pnl: t.pnl, symbol: t.symbol }))

  return (
    <div className="card">
      <div className={styles.title}>Trade time performance</div>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRIDLINE} />
          <XAxis
            type="number" dataKey="hour" domain={[0, 24]} tickFormatter={(v) => `${v}:00`}
            tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE}
            name="Time of day"
          />
          <YAxis
            type="number" dataKey="pnl" tickFormatter={(v) => `$${v.toLocaleString()}`}
            tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE}
            name="P&L" width={64}
          />
          <ZAxis range={[40, 40]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(v: number, name: string) => (name === 'pnl' ? `$${v.toLocaleString()}` : v)}
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
