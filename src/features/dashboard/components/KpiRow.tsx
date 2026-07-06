import type { Trade } from '../../../db/schema'
import { netPnl, winRate, profitFactor, avgWin, avgLoss, dayWinRate, outcomeCounts, grossWinLoss } from '../../../utils/tradeStats'
import { dailyPnlSeries } from '../../../utils/tradeAggregates'
import { StatTile } from '../../../shared/ui/StatTile'
import { RateGaugeTile } from './RateGaugeTile'
import { RatioRingTile } from './RatioRingTile'
import { AvgWinLossBarTile } from './AvgWinLossBarTile'
import { TradeDirectionPie } from './TradeDirectionPie'

export function KpiRow({ trades }: { trades: Trade[] }) {
  const net = netPnl(trades)
  const win = winRate(trades)
  const pf = profitFactor(trades)
  const daily = dailyPnlSeries(trades)
  const dayWin = dayWinRate(daily.map((d) => d.pnl))
  const aw = avgWin(trades)
  const al = avgLoss(trades)
  const ratio = al !== 0 ? Math.abs(aw / al) : aw > 0 ? Infinity : 0
  const tradeOutcomes = outcomeCounts(trades)
  const dayOutcomes = outcomeCounts(daily.map((d) => ({ pnl: d.pnl })))
  const { grossWins, grossLosses } = grossWinLoss(trades)

  return (
    <div className="kpi-row">
      <StatTile
        label="Net P&L"
        info="Total realized profit and loss across all trades in the current filter."
        badge={trades.length}
        value={`${net < 0 ? '-' : ''}$${Math.abs(net).toLocaleString()}`}
        color={net >= 0 ? 'var(--good)' : 'var(--critical)'}
      />
      <RateGaugeTile
        label="Trade win %"
        info="Share of trades closed as a win, breakeven, or loss."
        value={win}
        wins={tradeOutcomes.wins}
        breakeven={tradeOutcomes.breakeven}
        losses={tradeOutcomes.losses}
      />
      <RatioRingTile
        label="Profit factor"
        info="Gross profit divided by gross loss — above 1 means profitable overall."
        value={pf === Infinity ? '∞' : pf.toFixed(2)}
        grossWins={grossWins}
        grossLosses={grossLosses}
      />
      <RateGaugeTile
        label="Day win %"
        info="Share of trading days that closed net-positive, net-negative, or exactly flat."
        value={dayWin}
        wins={dayOutcomes.wins}
        breakeven={dayOutcomes.breakeven}
        losses={dayOutcomes.losses}
      />
      <AvgWinLossBarTile
        label="Avg win/loss trade"
        info="Average winning trade size vs. average losing trade size."
        ratio={ratio === Infinity ? '∞' : ratio.toFixed(2)}
        avgWin={aw}
        avgLoss={al}
      />
      <TradeDirectionPie trades={trades} />
    </div>
  )
}
