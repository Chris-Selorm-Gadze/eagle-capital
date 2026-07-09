import type { Trade } from '../../../types'
import { winRate, profitFactor, dayWinRate, avgWin, avgLoss, avgTradeDurationMinutes } from '../../../utils/tradeStats'
import { dailyPnlSeries } from '../../../utils/tradeAggregates'
import { formatDuration } from '../../../utils/format'
import { StatTile } from '../../../shared/ui/StatTile'

/** Performance stats for the real trades linked to a playbook's examples. */
export function PlaybookStats({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
        Link examples to logged trades to see performance stats for this playbook.
      </p>
    )
  }

  const win = winRate(trades)
  const pf = profitFactor(trades)
  const daily = dailyPnlSeries(trades)
  const dayWin = dayWinRate(daily.map((d) => d.pnl))
  const aw = avgWin(trades)
  const al = avgLoss(trades)
  const ratio = al !== 0 ? Math.abs(aw / al) : aw > 0 ? Infinity : 0
  const avgDuration = avgTradeDurationMinutes(trades)

  return (
    <div className="kpi-row">
      <StatTile label="Win rate" value={`${Math.round(win * 100)}%`} />
      <StatTile label="Trades" value={String(trades.length)} />
      <StatTile label="Profit factor" value={pf === Infinity ? '∞' : pf.toFixed(2)} />
      <StatTile label="Daily win rate" value={`${Math.round(dayWin * 100)}%`} />
      <StatTile label="Avg trade duration" value={formatDuration(avgDuration)} />
      <StatTile label="Win/Loss" value={ratio === Infinity ? '∞' : ratio.toFixed(2)} />
    </div>
  )
}
