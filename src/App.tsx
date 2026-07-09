import { useRef, useState } from 'react'
import { useAuth } from './features/auth/AuthContext'
import { useSupabaseData } from './db/useSupabaseData'
import { downloadElementAsImage } from './utils/snapshot'
import { todayISO } from './db/sessions'
import { Sidebar, type NavKey } from './shared/layout/Sidebar'
import { TopBar } from './shared/layout/TopBar'
import { TopNav } from './shared/layout/TopNav'
import { AddTradeDialog } from './features/trades/components/AddTradeDialog'
import { ImportTradesDialog } from './features/trades/components/ImportTradesDialog'
import { AddTradeChooserDialog } from './features/trades/components/AddTradeChooserDialog'
import { RiskCockpitPage } from './features/accounts/RiskCockpitPage'
import { TradeCopierPage } from './features/copier/TradeCopierPage'
import { TradeJournalPage } from './features/trades/TradeJournalPage'
import { TraderManagementPage } from './features/tradermanagement/TraderManagementPage'
import { PlaybooksPage } from './features/playbooks/PlaybooksPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { TradeLogPage } from './features/trades/TradeLogPage'
import { BrokerConnectionsPage } from './features/brokers/BrokerConnectionsPage'
import styles from './App.module.css'

export default function App() {
  const { user } = useAuth()
  const userId = user!.id
  const { accounts, sessions, payouts, rewards, trades, refresh } = useSupabaseData(userId)

  const [nav, setNav] = useState<NavKey>('dashboard')
  const [accountFilter, setAccountFilter] = useState<string | 'all'>('all')
  const [choosingAddMethod, setChoosingAddMethod] = useState(false)
  const [addingTrade, setAddingTrade] = useState(false)
  const [importingTrades, setImportingTrades] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)

  async function handleSnapshot() {
    if (!mainRef.current) return
    await downloadElementAsImage(mainRef.current, `eaglecapital-dashboard-${todayISO()}.png`)
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
        <Sidebar active={nav} onNavigate={setNav} />
        <div className={styles.content}>
          <TopBar
            accounts={accounts}
            accountFilter={accountFilter}
            onAccountFilterChange={setAccountFilter}
            onAddTrade={() => setChoosingAddMethod(true)}
            onSnapshot={nav === 'dashboard' ? handleSnapshot : undefined}
          />
          <main className={styles.main} ref={mainRef}>
            {nav === 'dashboard' && (
              <DashboardPage trades={filteredTrades} accounts={dashboardAccounts} payouts={filteredPayouts} />
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
            {nav === 'tradecopier' && <TradeCopierPage />}
            {nav === 'tradelog' && <TradeLogPage trades={filteredTrades} accounts={accounts} userId={userId} onChanged={refresh} />}
            {nav === 'tradejournal' && <TradeJournalPage />}
            {nav === 'tradermanagement' && <TraderManagementPage userId={userId} />}
            {nav === 'playbooks' && <PlaybooksPage trades={trades} userId={userId} />}
            {nav === 'brokers' && <BrokerConnectionsPage />}
          </main>
        </div>

        {choosingAddMethod && (
          <AddTradeChooserDialog
            onSelectManual={() => { setChoosingAddMethod(false); setAddingTrade(true) }}
            onSelectImport={() => { setChoosingAddMethod(false); setImportingTrades(true) }}
            onSelectBroker={() => { setChoosingAddMethod(false); setNav('brokers') }}
            onClose={() => setChoosingAddMethod(false)}
          />
        )}
        {addingTrade && (
          <AddTradeDialog accounts={accounts} userId={userId} onClose={() => setAddingTrade(false)} onSaved={refresh} />
        )}
        {importingTrades && (
          <ImportTradesDialog accounts={accounts} userId={userId} onClose={() => setImportingTrades(false)} onSaved={refresh} />
        )}
      </div>
    </div>
  )
}
