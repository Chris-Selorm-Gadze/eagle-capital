import type { Account, Payout, Trade } from '../db/schema'
import { dailyPnlSeries } from '../lib/tradeAggregates'
import { accountBalanceSeries } from '../lib/accountBalance'
import { KpiRow } from '../components/KpiRow'
import { TradeStatsList } from '../components/TradeStatsList'
import { CalendarHeatmap } from '../components/CalendarHeatmap'
import { CumulativePnlChart } from '../components/CumulativePnlChart'
import { AccountBalanceChart } from '../components/AccountBalanceChart'
import { DailyPnlBarChart } from '../components/DailyPnlBarChart'
import { TradeTimeScatter } from '../components/TradeTimeScatter'
import { TradeDurationScatter } from '../components/TradeDurationScatter'
import { RecentTradesTable } from '../components/RecentTradesTable'

export function DashboardPage({ trades, accounts, payouts }: { trades: Trade[]; accounts: Account[]; payouts: Payout[] }) {
  const daily = dailyPnlSeries(trades)
  const tradedAccountIds = new Set(trades.map((t) => t.accountId))
  const startingBalance = accounts
    .filter((a) => a.id !== undefined && tradedAccountIds.has(a.id))
    .reduce((sum, a) => sum + a.size, 0)
  const relevantPayouts = payouts.filter((p) => tradedAccountIds.has(p.accountId))
  const balance = accountBalanceSeries(daily, startingBalance, relevantPayouts)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <KpiRow trades={trades} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: '1rem' }}>
        <CalendarHeatmap daily={daily} />
        <CumulativePnlChart daily={daily} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <DailyPnlBarChart daily={daily} />
          <AccountBalanceChart data={balance} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <RecentTradesTable trades={trades} limit={8} />
          <TradeStatsList trades={trades} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: '1rem' }}>
        <TradeTimeScatter trades={trades} />
        <TradeDurationScatter trades={trades} />
      </div>
    </div>
  )
}
