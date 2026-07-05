import type { Trade } from '../db/schema'
import { netPnl, winRate, profitFactor, avgWin, avgLoss, dayWinRate } from '../domain/tradeStats'
import { dailyPnlSeries } from '../lib/tradeAggregates'
import { StatTile } from './StatTile'

export function KpiRow({ trades }: { trades: Trade[] }) {
  const net = netPnl(trades)
  const win = winRate(trades)
  const pf = profitFactor(trades)
  const dayWin = dayWinRate(dailyPnlSeries(trades).map((d) => d.pnl))
  const aw = avgWin(trades)
  const al = avgLoss(trades)
  const ratio = al !== 0 ? Math.abs(aw / al) : aw > 0 ? Infinity : 0

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
      <StatTile
        label="Net P&L"
        value={`${net < 0 ? '-' : ''}$${Math.abs(net).toLocaleString()}`}
        color={net >= 0 ? 'var(--good)' : 'var(--critical)'}
      />
      <StatTile label="Trade win %" value={`${(win * 100).toFixed(1)}%`} />
      <StatTile label="Profit factor" value={pf === Infinity ? '∞' : pf.toFixed(2)} />
      <StatTile label="Day win %" value={`${(dayWin * 100).toFixed(1)}%`} />
      <StatTile label="Avg win/loss trade" value={ratio === Infinity ? '∞' : ratio.toFixed(2)} />
    </div>
  )
}
