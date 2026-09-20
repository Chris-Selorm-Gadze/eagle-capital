import type { Account, Payout, SessionLog, Trade } from '../../db/schema'
import { dailyPnlSeries } from '../../utils/tradeAggregates'
import { balanceSeries, totalBalance, type AccountLedger } from '../../utils/ledger'
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
import { LiveStrip } from './components/LiveStrip'
import styles from './DashboardPage.module.css'

export function DashboardPage({
  trades,
  accounts,
  payouts,
  sessions,
  ledgers,
  onOpenDateInJournal,
  onAddAccount,
  onAddTrade,
  userId,
  onAccountsChanged,
}: {
  trades: Trade[]
  accounts: Account[]
  payouts: Payout[]
  sessions: SessionLog[]
  ledgers: Map<string, AccountLedger>
  onOpenDateInJournal: (date: string) => void
  onAddAccount: () => void
  onAddTrade: () => void
  userId: string
  onAccountsChanged?: () => void
}) {
  // With nothing logged there is no dashboard to draw — every tile would render
  // a zero or an empty frame. Show the way in instead.
  if (trades.length === 0) {
    return (
      <EmptyDesk
        userId={userId}
        hasAccounts={accounts.length > 0}
        onAddAccount={onAddAccount}
        onAddTrade={onAddTrade}
        onAccountsChanged={onAccountsChanged}
      />
    )
  }

  const daily = dailyPnlSeries(trades)
  // Both of these now come from the same ledger (utils/ledger.ts). They used to
  // be computed two different ways — the curve from "size + trade P&L" over
  // only the accounts that had traded, the figure from the stored
  // `accounts.balance` column over every account in the filter — so the line
  // and the number above it routinely disagreed.
  const balance = balanceSeries(accounts, trades, sessions, payouts)
  const currentBalance = totalBalance(accounts, ledgers)

  return (
    <div className="flex flex-col gap-6">
      {/* Open risk first, and kept out of everything below it — the stats and
          the curve are closed trades through utils/ledger.ts. */}
      <LiveStrip />

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
