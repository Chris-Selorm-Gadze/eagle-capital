import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { BalancePoint } from '../../../utils/accountBalance'
import {
  AXIS_LINE_STYLE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE,
  COLOR_ACCENT, COLOR_CRITICAL, COLOR_GRIDLINE,
} from '../../../utils/chartTheme'
import styles from './AccountBalanceChart.module.css'

const TICK_STYLE = { fontSize: 10, fill: 'var(--text-muted)' }

export function AccountBalanceChart({ data, currentBalance }: { data: BalancePoint[]; currentBalance: number }) {
  return (
    <div className={`card ${styles.root}`}>
      <div className={styles.headerRow}>
        <div className={styles.title}>
          Account balance
          <span
            className="info-icon"
            title="Starting allocation + cumulative trade P&L. Deposits / Withdrawals tracks cumulative payouts received."
          >
            i
          </span>
        </div>
        {/* Whatever the top-bar account filter currently selects — one account's own balance, or
            the sum across all accounts when "All accounts" is picked (see DashboardPage.tsx). */}
        <div className={styles.currentValue}>${currentBalance.toLocaleString()}</div>
      </div>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotBalance}`} />
          Account Balance
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotWithdrawals}`} />
          Deposits / Withdrawals
        </span>
      </div>
      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRIDLINE} />
            <XAxis dataKey="date" tick={TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE} />
            <YAxis
              tick={TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE}
              tickFormatter={(v) => `$${v.toLocaleString()}`} width={50}
            />
            <Tooltip
              formatter={(v: number) => `$${v.toLocaleString()}`}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            <Line type="monotone" dataKey="balance" name="Account Balance" stroke={COLOR_ACCENT} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="withdrawals" name="Deposits / Withdrawals" stroke={COLOR_CRITICAL} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
