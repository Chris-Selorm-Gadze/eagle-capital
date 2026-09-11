import type { Account, Payout, Trade } from '../../db/schema'
import { dailyPnlSeries } from '../../utils/tradeAggregates'
import { accountBalanceSeries } from '../../utils/accountBalance'
import { StatsRow } from './components/StatsRow'
import { EquityChart } from './components/EquityChart'
import { DailyPnlChart } from './components/DailyPnlChart'
import { TradeStatsList } from '../trades/components/TradeStatsList'
import { CalendarHeatmap } from './components/CalendarHeatmap'
import { AccountBalanceChart } from './components/AccountBalanceChart'
import { TradeTimeScatter } from './components/TradeTimeScatter'
import { TradeDurationScatter } from './components/TradeDurationScatter'
import { RecentTradesTable } from '../trades/components/RecentTradesTable'
import { EmptyDesk } from './components/EmptyDesk'
import styles from './DashboardPage.module.css'

export function DashboardPage({
  trades,
  accounts,
  payouts,
  onOpenDateInJournal,
  onAddAccount,
  onAddTrade,
}: {
  trades: Trade[]
  accounts: Account[]
  payouts: Payout[]
  onOpenDateInJournal: (date: string) => void
  onAddAccount: () => void
  onAddTrade: () => void
}) {
  // With nothing logged there is no dashboard to draw — every tile would render
  // a zero or an empty frame. Show the way in instead.
  if (trades.length === 0) {
    return (
      <EmptyDesk
        hasAccounts={accounts.length > 0}
        onAddAccount={onAddAccount}
        onAddTrade={onAddTrade}
      />
    )
  }

  const daily = dailyPnlSeries(trades)
  const tradedAccountIds = new Set(trades.map((t) => t.accountId))
  const startingBalance = accounts
    .filter((a) => a.id !== undefined && tradedAccountIds.has(a.id))
    .reduce((sum, a) => sum + a.size, 0)
  const relevantPayouts = payouts.filter((p) => tradedAccountIds.has(p.accountId))
  const balance = accountBalanceSeries(daily, startingBalance, relevantPayouts)
  // `accounts` here is already scoped by the header's account filter (one account, or all of
  // them) — summing balance works for both: it's just that one account's balance when a single
  // account is selected, or the real total when "All accounts" is picked.
  const currentBalance = accounts.reduce((sum, a) => sum + a.balance, 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Hairline grid from the dashboard block: cells are separated by the
          container's background showing through a 1px gap, so the KPI row and
          the charts read as one instrument panel rather than floating cards. */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-2 lg:grid-cols-4">
        <StatsRow trades={trades} />
        <EquityChart daily={daily} />
        <DailyPnlChart daily={daily} />
      </div>

      {/* The remaining tiles are the app's original CSS-Module components —
          they inherit theme.css, which is now light, so they sit coherently
          inside the shadcn shell. */}
      <div className={styles.topRow}>
        <CalendarHeatmap daily={daily} onOpenDateInJournal={onOpenDateInJournal} />
        <AccountBalanceChart data={balance} currentBalance={currentBalance} />
      </div>

      <div className={styles.columns}>
        <div className={styles.stack}>
          <RecentTradesTable trades={trades} limit={8} />
          <TradeTimeScatter trades={trades} />
        </div>
        <div className={styles.stack}>
          <TradeStatsList trades={trades} />
          <TradeDurationScatter trades={trades} />
        </div>
      </div>
    </div>
  )
}
