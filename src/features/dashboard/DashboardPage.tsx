import type { Account, Payout, Trade } from '../../db/schema'
import { dailyPnlSeries } from '../../utils/tradeAggregates'
import { accountBalanceSeries } from '../../utils/accountBalance'
import { KpiRow } from './components/KpiRow'
import { TradeStatsList } from '../trades/components/TradeStatsList'
import { CalendarHeatmap } from './components/CalendarHeatmap'
import { CumulativePnlChart } from './components/CumulativePnlChart'
import { AccountBalanceChart } from './components/AccountBalanceChart'
import { DailyPnlBarChart } from './components/DailyPnlBarChart'
import { TradeTimeScatter } from './components/TradeTimeScatter'
import { TradeDurationScatter } from './components/TradeDurationScatter'
import { RecentTradesTable } from '../trades/components/RecentTradesTable'
import styles from './DashboardPage.module.css'

export function DashboardPage({
  trades,
  accounts,
  payouts,
  onOpenDateInJournal,
}: {
  trades: Trade[]
  accounts: Account[]
  payouts: Payout[]
  onOpenDateInJournal: (date: string) => void
}) {
  const daily = dailyPnlSeries(trades)
  const tradedAccountIds = new Set(trades.map((t) => t.accountId))
  const startingBalance = accounts
    .filter((a) => a.id !== undefined && tradedAccountIds.has(a.id))
    .reduce((sum, a) => sum + a.size, 0)
  const relevantPayouts = payouts.filter((p) => tradedAccountIds.has(p.accountId))
  const balance = accountBalanceSeries(daily, startingBalance, relevantPayouts)

  return (
    <div className={styles.root}>
      <KpiRow trades={trades} />

      <div className={styles.topRow}>
        <CalendarHeatmap daily={daily} onOpenDateInJournal={onOpenDateInJournal} />
        <CumulativePnlChart daily={daily} />
      </div>

      <div className={styles.columns}>
        <div className={styles.stack}>
          <DailyPnlBarChart daily={daily} />
          <AccountBalanceChart data={balance} />
          <TradeTimeScatter trades={trades} />
        </div>
        <div className={styles.stack}>
          <RecentTradesTable trades={trades} limit={8} />
          <TradeStatsList trades={trades} />
          <TradeDurationScatter trades={trades} />
        </div>
      </div>
    </div>
  )
}
