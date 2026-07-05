import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/schema'
import { Sidebar, type NavKey } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { TopNav } from './components/layout/TopNav'
import { AddTradeDialog } from './components/AddTradeDialog'
import { ImportTradesDialog } from './components/ImportTradesDialog'
import { AddTradeChooserDialog } from './components/AddTradeChooserDialog'
import { RiskCockpitPage } from './pages/RiskCockpitPage'
import { TradeCopierPage } from './pages/TradeCopierPage'
import { TradeJournalPage } from './pages/TradeJournalPage'
import { PlanPage } from './pages/PlanPage'
import { DashboardPage } from './pages/DashboardPage'
import { TradeLogPage } from './pages/TradeLogPage'

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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar active={nav} onNavigate={setNav} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <TopBar
            accounts={accounts}
            accountFilter={accountFilter}
            onAccountFilterChange={setAccountFilter}
            onAddTrade={() => setChoosingAddMethod(true)}
          />
          <main style={{ padding: '1.5rem', flex: 1 }}>
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
