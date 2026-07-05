import type { Trade } from '../db/schema'
import {
  avgWin, avgLoss, avgTradeDurationMinutes, avgWinDurationMinutes, avgLossDurationMinutes,
  totalLotsTraded, longPct, bestTrade, worstTrade,
} from '../domain/tradeStats'
import { dailyPnlSeries, mostActiveDay, mostProfitableDay, leastProfitableDay } from '../lib/tradeAggregates'
import { formatDuration } from '../lib/format'
import { StatTile } from './StatTile'

function fmtMoney(n: number): string {
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString()}`
}

export function TradeStatsGrid({ trades }: { trades: Trade[] }) {
  const daily = dailyPnlSeries(trades)
  const active = mostActiveDay(daily)
  const mostProfitable = mostProfitableDay(daily)
  const leastProfitable = leastProfitableDay(daily)
  const best = bestTrade(trades)
  const worst = worstTrade(trades)
  const long = longPct(trades)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem' }}>
      <StatTile label="Total trades" value={String(trades.length)} />
      <StatTile label="Total lots traded" value={totalLotsTraded(trades).toLocaleString()} />
      <StatTile label="Avg trade duration" value={formatDuration(avgTradeDurationMinutes(trades))} />
      <StatTile label="Avg win duration" value={formatDuration(avgWinDurationMinutes(trades))} />
      <StatTile label="Avg loss duration" value={formatDuration(avgLossDurationMinutes(trades))} />
      <StatTile label="Avg winning trade" value={fmtMoney(avgWin(trades))} color="var(--good)" />
      <StatTile label="Avg losing trade" value={fmtMoney(avgLoss(trades))} color="var(--critical)" />
      <StatTile label="Trade direction" value={`${(long * 100).toFixed(0)}% long / ${((1 - long) * 100).toFixed(0)}% short`} />
      <StatTile
        label="Best trade"
        value={best ? `${fmtMoney(best.pnl)} · ${best.symbol}` : 'N/A'}
        color={best ? 'var(--good)' : undefined}
      />
      <StatTile
        label="Worst trade"
        value={worst ? `${fmtMoney(worst.pnl)} · ${worst.symbol}` : 'N/A'}
        color={worst ? 'var(--critical)' : undefined}
      />
      <StatTile
        label="Most active day"
        value={active ? `${active.date} · ${active.tradeCount} trade${active.tradeCount === 1 ? '' : 's'}` : 'N/A'}
      />
      <StatTile
        label="Most profitable day"
        value={mostProfitable ? `${mostProfitable.date} · ${fmtMoney(mostProfitable.pnl)}` : 'N/A'}
        color={mostProfitable ? 'var(--good)' : undefined}
      />
      <StatTile
        label="Least profitable day"
        value={leastProfitable ? `${leastProfitable.date} · ${fmtMoney(leastProfitable.pnl)}` : 'N/A'}
        color={leastProfitable ? 'var(--critical)' : undefined}
      />
    </div>
  )
}
