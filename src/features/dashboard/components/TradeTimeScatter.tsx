import { useState } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts'
import type { Trade } from '../../../db/schema'
import {
  AXIS_TICK_STYLE, AXIS_LINE_STYLE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE,
  COLOR_GOOD, COLOR_CRITICAL, COLOR_GRIDLINE,
} from '../../../utils/chartTheme'
import styles from './TradeTimeScatter.module.css'

type TimeZoneMode = 'local' | 'ny'

const HOUR_TICKS = Array.from({ length: 25 }, (_, i) => i)

function formatHourLabel(v: number): string {
  const h = Math.floor(v)
  const m = Math.round((v - h) * 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

// 'local' uses Date.getHours(), which already reads in the browser's own timezone — 'ny' pins
// the hour-of-day to America/New_York regardless of where the trader is, since that's the
// standard reference clock for US market sessions.
function hourOfDay(iso: string, zone: TimeZoneMode): number {
  const d = new Date(iso)
  if (zone === 'local') return d.getHours() + d.getMinutes() / 60
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(d)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour + minute / 60
}

export function TradeTimeScatter({ trades }: { trades: Trade[] }) {
  const [zone, setZone] = useState<TimeZoneMode>('local')
  const wins = trades.filter((t) => t.pnl >= 0).map((t) => ({ hour: hourOfDay(t.entryTime, zone), pnl: t.pnl, symbol: t.symbol }))
  const losses = trades.filter((t) => t.pnl < 0).map((t) => ({ hour: hourOfDay(t.entryTime, zone), pnl: t.pnl, symbol: t.symbol }))

  return (
    <div className="card">
      <div className={styles.header}>
        <div className={styles.title}>Trade time performance</div>
        <div className={styles.zoneToggle}>
          <button className={`${styles.zoneBtn} ${zone === 'local' ? styles.zoneBtnActive : ''}`} onClick={() => setZone('local')}>Local</button>
          <button className={`${styles.zoneBtn} ${zone === 'ny' ? styles.zoneBtnActive : ''}`} onClick={() => setZone('ny')}>NY (EST)</button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRIDLINE} />
          <XAxis
            type="number" dataKey="hour" domain={[0, 24]}
            ticks={HOUR_TICKS} tickFormatter={(v) => (v % 2 === 0 ? `${v}:00` : '')}
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
            formatter={(v: number, name: string) => (name === 'pnl' ? `$${v.toLocaleString()}` : formatHourLabel(v))}
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
