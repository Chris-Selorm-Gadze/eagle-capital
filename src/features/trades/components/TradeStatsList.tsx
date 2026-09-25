import type { Trade } from '../../../db/schema'
import {
  avgWin, avgLoss, avgTradeDurationMinutes, avgWinDurationMinutes, avgLossDurationMinutes,
  totalLotsTraded, bestTrade, worstTrade,
} from '../../../utils/tradeStats'
import { dailyPnlSeries, mostActiveWeekday, mostProfitableWeekday, leastProfitableWeekday } from '../../../utils/tradeAggregates'
import { formatDuration } from '../../../utils/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useMoney } from '@/components/money-context'

/* Converted onto shadcn Card — the dashboard's last CSS-Module tile. */

interface StatRow {
  label: string
  value: string
  color?: string
}

/** Color follows the actual sign of the value, not which stat it is —
 * e.g. "least profitable day" can still be net-positive if every day won. */
function signColor(n: number): string {
  return n >= 0 ? 'var(--good-deep)' : 'var(--critical-deep)'
}

export function TradeStatsList({ trades }: { trades: Trade[] }) {
  const { signedExact: fmtMoney } = useMoney()
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
        { label: 'Avg winning trade', value: fmtMoney(avgWin(trades)), color: 'var(--good-deep)' },
        { label: 'Avg losing trade', value: fmtMoney(avgLoss(trades)), color: 'var(--critical-deep)' },
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
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-3">
        <CardTitle>Trade stats</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {groups.map((group) => (
          <div className="border-b px-4 py-3 last:border-b-0" key={group.title}>
            <div className="mb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {group.title}
            </div>
            {group.rows.map((row) => (
              <div
                className="flex items-baseline justify-between gap-3 py-1 text-sm"
                key={row.label}
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span
                  className="text-right font-medium tabular-nums"
                  style={row.color ? { color: row.color } : undefined}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
