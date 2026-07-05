import type { Trade } from '../db/schema'
import {
  avgWin, avgLoss, avgTradeDurationMinutes, avgWinDurationMinutes, avgLossDurationMinutes,
  totalLotsTraded, bestTrade, worstTrade,
} from '../domain/tradeStats'
import { dailyPnlSeries, mostActiveWeekday, mostProfitableWeekday, leastProfitableWeekday } from '../lib/tradeAggregates'
import { formatDuration } from '../lib/format'

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

  const rows: { label: string; value: string; color?: string }[] = [
    { label: 'Total trades', value: String(trades.length) },
    { label: 'Total lots traded', value: totalLotsTraded(trades).toLocaleString() },
    { label: 'Avg trade duration', value: formatDuration(avgTradeDurationMinutes(trades)) },
    { label: 'Avg win duration', value: formatDuration(avgWinDurationMinutes(trades)) },
    { label: 'Avg loss duration', value: formatDuration(avgLossDurationMinutes(trades)) },
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
  ]

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', background: 'var(--surface)' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Trade stats</div>
      {rows.map((row, i) => (
        <div
          key={row.label}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem',
            padding: '0.5rem 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{row.label}</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: row.color ?? 'var(--text-primary)', textAlign: 'right' }}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  )
}
