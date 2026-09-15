import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { LedgerPoint } from '../../../utils/ledger'
import {
  AXIS_LINE_STYLE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE,
  COLOR_ACCENT, COLOR_CRITICAL, COLOR_GRIDLINE,
} from '../../../utils/chartTheme'
import styles from './AccountBalanceChart.module.css'
import { formatDate } from '../../../components/formater'

const TICK_STYLE = { fontSize: 10, fill: 'var(--text-muted)' }

export function AccountBalanceChart({ data, currentBalance }: { data: LedgerPoint[]; currentBalance: number }) {
  return (
    <div className={`card ${styles.root}`}>
      <div className={styles.headerRow}>
        <div className={styles.title}>
          Account balance
          <span
            aria-label="Starting allocation + everything you've logged, minus what you've withdrawn. Deposits / Withdrawals tracks cumulative payouts received."
            className="info-icon"
            data-tooltip="Starting allocation + everything you've logged − what you've withdrawn. Deposits / Withdrawals tracks cumulative payouts received."
            role="note"
            tabIndex={0}
          >
            i
          </span>
        </div>
        {/* The same ledger the line is drawn from, summed across whatever the
            top-bar account filter currently selects — so this figure and the
            end of the curve are always the same number. */}
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
          {/* left margin clears the widest Y tick ("$200,000"), which was being
              cut off at the plot edge. */}
          <LineChart data={data} margin={{ top: 5, right: 10, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRIDLINE} />
            {/* Same "Jun 1" formatting the dashboard's other two charts use —
                this one was printing raw ISO dates (2026-06-15) beside them. */}
            <XAxis
              dataKey="date"
              tick={TICK_STYLE}
              tickFormatter={(v) => formatDate(String(v), 'day-month')}
              axisLine={AXIS_LINE_STYLE}
              tickLine={AXIS_LINE_STYLE}
            />
            <YAxis
              tick={TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={AXIS_LINE_STYLE}
              tickFormatter={(v) => `$${v.toLocaleString()}`} width={68}
            />
            <Tooltip
              formatter={(v) => `$${Number(v).toLocaleString()}`}
              labelFormatter={(v) => formatDate(String(v), 'full')}
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
