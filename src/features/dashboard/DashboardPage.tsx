import { useMemo } from 'react'
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
  // Every hook runs before the empty-desk branch below. This page flips from
  // empty to full the moment the worker journals a first trade, and a hook
  // after a conditional return makes that transition throw.
  // Memoised: these walk the whole trade history, and this component
  // re-renders whenever anything in App does — every dialog open recomputed
  // the equity curve, the calendar and both scatters from scratch.
  const daily = useMemo(() => dailyPnlSeries(trades), [trades])
  // Both of these now come from the same ledger (utils/ledger.ts). They used to
  // be computed two different ways — the curve from "size + trade P&L" over
  // only the accounts that had traded, the figure from the stored
  // `accounts.balance` column over every account in the filter — so the line
  // and the number above it routinely disagreed.
  const balance = useMemo(
    () => balanceSeries(accounts, trades, sessions, payouts),
    [accounts, trades, sessions, payouts],
  )
  const currentBalance = useMemo(
    () => totalBalance(accounts, ledgers),
    [accounts, ledgers],
  )

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

  return (
    <div className="flex flex-col gap-6">
      {/* Open risk first, and kept out of everything below it — the stats and
          the curve are closed trades through utils/ledger.ts. */}
      <LiveStrip />

      {/* Hairline grid from the dashboard block: cells are separated by the
          container's background showing through a 1px gap, so the KPI row and
          the charts read as one instrument panel rather than floating cards.

          Every chart now lives in here. Four of them used to sit below it in
          their own CSS-Module flex rows, drawn with bare Recharts, their own card
          shell, their own tooltip and a hand-built legend — two chart designs
          fifteen lines apart in this file. They are all on ChartContainer now, so
          the panel is one instrument rather than two.

          Row order is deliberate: the figures, then the curve they add up to,
          then the two distributions, then the two scatters that explain them,
          then the month. The equity curve takes the full width because it is the
          one chart that answers "how am I doing" on its own. */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-2 lg:grid-cols-4">
        <StatsRow trades={trades} />
        <EquityChart daily={daily} />
        <DailyPnlChart daily={daily} />
        <AccountBalanceChart currentBalance={currentBalance} data={balance} />
        <TradeTimeScatter trades={trades} />
        <TradeDurationScatter trades={trades} />
        <CalendarHeatmap daily={daily} onOpenDateInJournal={onOpenDateInJournal} />
      </div>

      {/* Still the app's original CSS-Module components — a table and a stat
          list, not charts. They convert with the rest of the legacy pages. */}
      <div className={styles.columns}>
        <RecentTradesTable trades={trades} limit={8} />
        <TradeStatsList trades={trades} />
      </div>
    </div>
  )
}
