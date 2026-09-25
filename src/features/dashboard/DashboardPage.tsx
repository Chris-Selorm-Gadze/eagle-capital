import { useMemo, useState } from 'react'
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
import { JournalGap } from './components/JournalGap'
import { MoneyProvider } from '@/components/money-context'
import { Button } from '@/components/ui/button'
import { currencyGroups } from '../../utils/money'
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
  //
  // One currency at a time. The accounts in scope can hold different
  // currencies (a USD account beside a USC cent account), and there is no
  // exchange rate here to convert them with, so every money figure below is
  // computed over one currency's accounts only — see utils/money.ts. With a
  // single currency nothing is filtered and nothing on screen changes.
  const groups = useMemo(() => currencyGroups(accounts, trades), [accounts, trades])
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null)
  const activeGroup = groups.find((g) => g.currency === chosenCurrency) ?? groups[0]
  const scoped = useMemo(() => {
    if (!activeGroup || groups.length <= 1) return { trades, accounts, sessions, payouts }
    const ids = activeGroup.accountIds
    return {
      trades: trades.filter((t) => ids.has(t.accountId)),
      accounts: accounts.filter((a) => a.id !== undefined && ids.has(a.id)),
      sessions: sessions.filter((x) => ids.has(x.accountId)),
      payouts: payouts.filter((x) => ids.has(x.accountId)),
    }
  }, [activeGroup, groups.length, trades, accounts, sessions, payouts])

  const daily = useMemo(() => dailyPnlSeries(scoped.trades), [scoped.trades])
  // Both of these now come from the same ledger (utils/ledger.ts). They used to
  // be computed two different ways — the curve from "size + trade P&L" over
  // only the accounts that had traded, the figure from the stored
  // `accounts.balance` column over every account in the filter — so the line
  // and the number above it routinely disagreed.
  const balance = useMemo(
    () => balanceSeries(scoped.accounts, scoped.trades, scoped.sessions, scoped.payouts),
    [scoped],
  )
  const currentBalance = useMemo(
    () => totalBalance(scoped.accounts, ledgers),
    [scoped.accounts, ledgers],
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

      {/* Only for the part-journalled desk; renders nothing otherwise. The
          all-unjournalled desk never gets here -- it has no trades, so it sees
          EmptyDesk above instead. */}
      <JournalGap onAccountsChanged={onAccountsChanged} userId={userId} />

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
      {groups.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Figures in</span>
          {groups.map((g) => (
            <Button
              aria-pressed={g === activeGroup}
              key={g.currency}
              onClick={() => setChosenCurrency(g.currency)}
              size="xs"
              variant={g === activeGroup ? 'secondary' : 'outline'}
            >
              {g.currency} · {g.accountIds.size} account{g.accountIds.size === 1 ? '' : 's'}
            </Button>
          ))}
          <span className="text-muted-foreground text-xs">
            Different currencies are never added together.
          </span>
        </div>
      )}

      <MoneyProvider currency={activeGroup?.currency ?? 'USD'}>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-2 lg:grid-cols-4">
          <StatsRow trades={scoped.trades} />
          <EquityChart daily={daily} />
          <DailyPnlChart daily={daily} />
          <AccountBalanceChart currentBalance={currentBalance} data={balance} />
          <TradeTimeScatter trades={scoped.trades} />
          <TradeDurationScatter trades={scoped.trades} />
          <CalendarHeatmap daily={daily} onOpenDateInJournal={onOpenDateInJournal} />
        </div>

        {/* Still the app's original CSS-Module components — a table and a stat
            list, not charts. They convert with the rest of the legacy pages. */}
        <div className={styles.columns}>
          <RecentTradesTable trades={scoped.trades} limit={8} />
          <TradeStatsList trades={scoped.trades} />
        </div>
      </MoneyProvider>
    </div>
  )
}
