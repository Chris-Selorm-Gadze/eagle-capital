import type { Trade } from '../../../db/schema'
import {
  avgWin, avgLoss, avgTradeDurationMinutes, avgWinDurationMinutes, avgLossDurationMinutes,
  totalLotsTraded, bestTrade, worstTrade,
} from '../../../utils/tradeStats'
import { dailyPnlSeries, mostActiveWeekday, mostProfitableWeekday, leastProfitableWeekday } from '../../../utils/tradeAggregates'
import { formatDuration } from '../../../utils/format'
import styles from './TradeStatsList.module.css'

interface StatRow {
  label: string
  value: string
  color?: string
}

function fmtMoney(n: number): string {
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString()}`
}

/** Color follows the actual sign of the value, not which stat it is —
 * e.g. "least profitable day" can still be net-positive if every day won. */
function signColor(n: number): string {
  return n >= 0 ? 'var(--good)' : 'var(--critical)'
}

export function TradeStatsList({ trades }: { trades: Trade[] }) {
  const daily = dailyPnlSeries(trades)
  const active = mostActiveWeekday(daily)
  const mostProfitable = mostProfitableWeekday(daily)
  const leastProfitable = leastProfitableWeekday(daily)
  const best = bestTrade(trades)
  const worst = worstTrade(trades)

  const groups: { title: string; rows: StatRow[] }[] = [
    {
      title: 'Activity',
      rows: [
        { label: 'Total trades', value: String(trades.length) },
        { label: 'Total lots traded', value: totalLotsTraded(trades).toLocaleString() },
        { label: 'Avg trade duration', value: formatDuration(avgTradeDurationMinutes(trades)) },
        { label: 'Avg win duration', value: formatDuration(avgWinDurationMinutes(trades)) },
        { label: 'Avg loss duration', value: formatDuration(avgLossDurationMinutes(trades)) },
      ],
    },
    {
      title: 'P&L',
      rows: [
        { label: 'Avg winning trade', value: fmtMoney(avgWin(trades)), color: 'var(--good)' },
        { label: 'Avg losing trade', value: fmtMoney(avgLoss(trades)), color: 'var(--critical)' },
        {
          label: 'Best trade',
          value: best ? `${fmtMoney(best.pnl)} · ${best.symbol}` : 'N/A',
          color: best ? signColor(best.pnl) : undefined,
        },
        {
          label: 'Worst trade',
          value: worst ? `${fmtMoney(worst.pnl)} · ${worst.symbol}` : 'N/A',
          color: worst ? signColor(worst.pnl) : undefined,
        },
      ],
    },
    {
      title: 'By weekday',
      rows: [
        {
          label: 'Most active day',
          value: active ? `${active.weekday} · ${active.tradeCount} trades total` : 'N/A',
        },
        {
          label: 'Most profitable day',
          value: mostProfitable ? `${mostProfitable.weekday} · ${fmtMoney(mostProfitable.pnl)} total` : 'N/A',
          color: mostProfitable ? signColor(mostProfitable.pnl) : undefined,
        },
        {
          label: 'Least profitable day',
          value: leastProfitable ? `${leastProfitable.weekday} · ${fmtMoney(leastProfitable.pnl)} total` : 'N/A',
          color: leastProfitable ? signColor(leastProfitable.pnl) : undefined,
        },
      ],
    },
  ]

  return (
    <div className="card">
      <div className={styles.title}>Trade stats</div>
      {groups.map((group) => (
        <div key={group.title} className={styles.group}>
          <div className={styles.groupTitle}>{group.title}</div>
          {group.rows.map((row) => (
            <div key={row.label} className={styles.row}>
              <span className={styles.label}>{row.label}</span>
              <span className={styles.value} style={row.color ? { color: row.color } : undefined}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
