import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/schema'
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
import { PlanPage } from './features/plan/PlanPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { TradeLogPage } from './features/trades/TradeLogPage'
import styles from './App.module.css'

export default function App() {
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const sessions = useLiveQuery(() => db.sessions.toArray()) ?? []
  const trades = useLiveQuery(() => db.trades.toArray()) ?? []
  const payouts = useLiveQuery(() => db.payouts.toArray()) ?? []

  const [nav, setNav] = useState<NavKey>('dashboard')
  const [accountFilter, setAccountFilter] = useState<number | 'all'>('all')
  const [choosingAddMethod, setChoosingAddMethod] = useState(false)
  const [addingTrade, setAddingTrade] = useState(false)
  const [importingTrades, setImportingTrades] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)

  async function handleSnapshot() {
    if (!mainRef.current) return
    await downloadElementAsImage(mainRef.current, `prop-tracker-dashboard-${todayISO()}.png`)
  }

  const sessionsByAccountId = new Map<number, typeof sessions>()
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
            {nav === 'cockpit' && <RiskCockpitPage accounts={accounts} sessionsByAccountId={sessionsByAccountId} />}
            {nav === 'tradecopier' && <TradeCopierPage />}
            {nav === 'tradelog' && <TradeLogPage trades={filteredTrades} accounts={accounts} />}
            {nav === 'tradejournal' && <TradeJournalPage />}
            {nav === 'plan' && <PlanPage accounts={accounts} sessionsByAccountId={sessionsByAccountId} />}
          </main>
        </div>

        {choosingAddMethod && (
          <AddTradeChooserDialog
            onSelectManual={() => { setChoosingAddMethod(false); setAddingTrade(true) }}
            onSelectImport={() => { setChoosingAddMethod(false); setImportingTrades(true) }}
            onClose={() => setChoosingAddMethod(false)}
          />
        )}
        {addingTrade && <AddTradeDialog accounts={accounts} onClose={() => setAddingTrade(false)} />}
        {importingTrades && <ImportTradesDialog accounts={accounts} onClose={() => setImportingTrades(false)} />}
      </div>
    </div>
  )
}
