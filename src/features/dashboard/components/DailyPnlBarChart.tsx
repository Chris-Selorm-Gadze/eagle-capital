import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { DailyPnl } from '../../../utils/tradeAggregates'
import {
  AXIS_TICK_STYLE, AXIS_LINE_STYLE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE,
  COLOR_GOOD, COLOR_CRITICAL, COLOR_GRIDLINE,
} from '../../../utils/chartTheme'
import styles from './DailyPnlBarChart.module.css'

export function DailyPnlBarChart({ daily }: { daily: DailyPnl[] }) {
  const streak = daily.map((d) => ({ date: d.date, sign: d.pnl >= 0 ? 1 : -1 }))

  return (
    <div className="card">
      <div className={styles.title}>Net daily P&amp;L</div>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRIDLINE} />
          <XAxis dataKey="date" tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE} />
          <YAxis tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE}
            tickFormatter={(v) => `$${v.toLocaleString()}`} width={50} />
          <Tooltip
            cursor={false}
            formatter={(v: number) => `$${v.toLocaleString()}`}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
          />
          <Bar dataKey="pnl" maxBarSize={26}>
            {daily.map((d, i) => (
              <Cell key={i} fill={d.pnl >= 0 ? COLOR_GOOD : COLOR_CRITICAL} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className={styles.streakTitle}>Win/loss streak</div>
      <ResponsiveContainer width="100%" height={72}>
        <AreaChart data={streak} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
          <defs>
            {/* Zero sits exactly at 50% since sign is always +1/-1 — hard color switch there,
                fading toward full opacity at each extreme, same visual language as the
                cumulative P&L chart above. */}
            <linearGradient id="streakFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={COLOR_GOOD} stopOpacity={0.5} />
              <stop offset={0.5} stopColor={COLOR_GOOD} stopOpacity={0.1} />
              <stop offset={0.5} stopColor={COLOR_CRITICAL} stopOpacity={0.1} />
              <stop offset={1} stopColor={COLOR_CRITICAL} stopOpacity={0.5} />
            </linearGradient>
            <linearGradient id="streakStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0.5} stopColor={COLOR_GOOD} />
              <stop offset={0.5} stopColor={COLOR_CRITICAL} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis domain={[-1, 1]} hide />
          <ReferenceLine y={0} stroke={COLOR_GRIDLINE} />
          <Tooltip
            formatter={(v: number) => (v > 0 ? 'Win' : 'Loss')}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
          />
          <Area type="stepAfter" dataKey="sign" baseValue={0} stroke="url(#streakStroke)" fill="url(#streakFill)" strokeWidth={1.5} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
