import { useEffect, useRef, useState } from 'react'
import { useAuth } from './features/auth/AuthContext'
import { useSupabaseData } from './db/useSupabaseData'
import { downloadElementAsImage } from './utils/snapshot'
import { todayISO } from './db/sessions'
import { Sidebar, type NavKey } from './shared/layout/Sidebar'
import { pathForNav, navForPath } from './shared/routing'
import { TopBar } from './shared/layout/TopBar'
import { TopNav } from './shared/layout/TopNav'
import { AddTradeDialog } from './features/trades/components/AddTradeDialog'
import { ImportTradesDialog } from './features/trades/components/ImportTradesDialog'
import { AddTradeChooserDialog } from './features/trades/components/AddTradeChooserDialog'
import { AddAccountDialog } from './features/accounts/components/AddAccountDialog'
import { RiskCockpitPage } from './features/accounts/RiskCockpitPage'
import { TradeCopierPage } from './features/copier/TradeCopierPage'
import { TradeJournalPage } from './features/trades/TradeJournalPage'
import { TraderManagementPage } from './features/tradermanagement/TraderManagementPage'
import { PlaybooksPage } from './features/playbooks/PlaybooksPage'
import { InsightsPage } from './features/insights/InsightsPage'
import { ChartingPage } from './features/charting/ChartingPage'
import { EconomicCalendarPage } from './features/calendar/EconomicCalendarPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { TradeLogPage } from './features/trades/TradeLogPage'
import { BrokerConnectionsPage } from './features/brokers/BrokerConnectionsPage'
import styles from './App.module.css'

export default function App() {
  const { user } = useAuth()
  const userId = user!.id
  const { accounts, sessions, payouts, rewards, trades, refresh } = useSupabaseData(userId)

  const [nav, setNavState] = useState<NavKey>(() => navForPath(window.location.pathname))
  const [accountFilter, setAccountFilter] = useState<string | 'all'>('all')
  const [choosingAddMethod, setChoosingAddMethod] = useState(false)
  const [addingTrade, setAddingTrade] = useState(false)
  const [importingTrades, setImportingTrades] = useState(false)
  const [addingAccount, setAddingAccount] = useState(false)
  const [pendingJournalDate, setPendingJournalDate] = useState<string | undefined>(undefined)
  const mainRef = useRef<HTMLDivElement>(null)
  const fromPopState = useRef(false)

  // Keeps the URL in sync with `nav` and supports the browser back/forward buttons moving
  // between tabs — plain History API, no router library, consistent with this app's
  // "plain React, no state library" approach elsewhere.
  function navigate(key: NavKey) {
    setNavState(key)
  }

  useEffect(() => {
    if (fromPopState.current) {
      fromPopState.current = false
      return
    }
    const path = pathForNav(nav)
    if (window.location.pathname !== path) {
      window.history.pushState({ nav }, '', path)
    }
  }, [nav])

  useEffect(() => {
    // The initial page-load history entry has no state attached — replace it so the first
    // back-press after navigating away has a well-defined tab to return to.
    window.history.replaceState({ nav }, '', pathForNav(nav))
    function handlePopState(event: PopStateEvent) {
      const key = (event.state?.nav as NavKey | undefined) ?? navForPath(window.location.pathname)
      fromPopState.current = true
      setNavState(key)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSnapshot() {
    if (!mainRef.current) return
    await downloadElementAsImage(mainRef.current, `eaglecapital-dashboard-${todayISO()}.png`)
  }

  function handleNavigate(key: NavKey) {
    setPendingJournalDate(undefined)
    navigate(key)
  }

  function handleOpenDateInJournal(date: string) {
    setPendingJournalDate(date)
    navigate('tradejournal')
  }

  const sessionsByAccountId = new Map<string, typeof sessions>()
  for (const s of sessions) {
    const list = sessionsByAccountId.get(s.accountId) ?? []
    list.push(s)
    sessionsByAccountId.set(s.accountId, list)
  }

  const filteredTrades = accountFilter === 'all' ? trades : trades.filter((t) => t.accountId === accountFilter)
  const dashboardAccounts = accountFilter === 'all' ? accounts : accounts.filter((a) => a.id === accountFilter)
  const filteredPayouts = accountFilter === 'all' ? payouts : payouts.filter((p) => p.accountId === accountFilter)

  return (
    <div className={styles.root}>
      <TopNav />
      <div className={styles.body}>
        <Sidebar active={nav} onNavigate={handleNavigate} />
        <div className={styles.content}>
          {nav === 'dashboard' && (
            <TopBar
              accounts={accounts}
              accountFilter={accountFilter}
              onAccountFilterChange={setAccountFilter}
              onAddTrade={() => setChoosingAddMethod(true)}
              onAddAccount={() => setAddingAccount(true)}
              onSnapshot={handleSnapshot}
            />
          )}
          <main className={styles.main} ref={mainRef}>
            {nav === 'dashboard' && (
              <DashboardPage
                trades={filteredTrades}
                accounts={dashboardAccounts}
                payouts={filteredPayouts}
                onOpenDateInJournal={handleOpenDateInJournal}
              />
            )}
            {nav === 'cockpit' && (
              <RiskCockpitPage
                accounts={accounts}
                payouts={payouts}
                rewards={rewards}
                sessionsByAccountId={sessionsByAccountId}
                userId={userId}
                onChanged={refresh}
              />
            )}
            {nav === 'tradecopier' && <TradeCopierPage onGoToBrokerConnections={() => navigate('brokers')} />}
            {nav === 'tradelog' && <TradeLogPage trades={filteredTrades} accounts={accounts} userId={userId} onChanged={refresh} />}
            {nav === 'tradejournal' && (
              <TradeJournalPage
                trades={trades}
                accounts={accounts}
                userId={userId}
                onChanged={refresh}
                initialDateFilter={pendingJournalDate}
              />
            )}
            {nav === 'tradermanagement' && <TraderManagementPage userId={userId} trades={trades} />}
            {nav === 'playbooks' && <PlaybooksPage trades={trades} userId={userId} />}
            {nav === 'insights' && <InsightsPage trades={trades} userId={userId} />}
            {nav === 'charting' && <ChartingPage trades={trades} />}
            {nav === 'calendar' && <EconomicCalendarPage />}
            {nav === 'brokers' && <BrokerConnectionsPage accounts={accounts} userId={userId} />}
          </main>
        </div>

        {choosingAddMethod && (
          <AddTradeChooserDialog
            onSelectManual={() => { setChoosingAddMethod(false); setAddingTrade(true) }}
            onSelectImport={() => { setChoosingAddMethod(false); setImportingTrades(true) }}
            onSelectBroker={() => { setChoosingAddMethod(false); navigate('brokers') }}
            onClose={() => setChoosingAddMethod(false)}
          />
        )}
        {addingTrade && (
          <AddTradeDialog accounts={accounts} userId={userId} onClose={() => setAddingTrade(false)} onSaved={refresh} />
        )}
        {importingTrades && (
          <ImportTradesDialog accounts={accounts} userId={userId} onClose={() => setImportingTrades(false)} onSaved={refresh} />
        )}
        {addingAccount && (
          <AddAccountDialog userId={userId} onClose={() => setAddingAccount(false)} onSaved={refresh} />
        )}
      </div>
    </div>
  )
}
