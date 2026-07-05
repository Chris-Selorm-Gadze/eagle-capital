import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/schema'
import { Sidebar, type NavKey } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { AddTradeDialog } from './components/AddTradeDialog'
import { ImportTradesDialog } from './components/ImportTradesDialog'
import { RiskCockpitPage } from './pages/RiskCockpitPage'
import { PlanPage } from './pages/PlanPage'
import { DashboardPage } from './pages/DashboardPage'
import { TradeLogPage } from './pages/TradeLogPage'

export default function App() {
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const sessions = useLiveQuery(() => db.sessions.toArray()) ?? []
  const trades = useLiveQuery(() => db.trades.toArray()) ?? []

  const [nav, setNav] = useState<NavKey>('dashboard')
  const [accountFilter, setAccountFilter] = useState<number | 'all'>('all')
  const [addingTrade, setAddingTrade] = useState(false)
  const [importingTrades, setImportingTrades] = useState(false)

  const sessionsByAccountId = new Map<number, typeof sessions>()
  for (const s of sessions) {
    const list = sessionsByAccountId.get(s.accountId) ?? []
    list.push(s)
    sessionsByAccountId.set(s.accountId, list)
  }

  const filteredTrades = accountFilter === 'all' ? trades : trades.filter((t) => t.accountId === accountFilter)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active={nav} onNavigate={setNav} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <TopBar
          accounts={accounts}
          accountFilter={accountFilter}
          onAccountFilterChange={setAccountFilter}
          onAddTrade={() => setAddingTrade(true)}
          onImportTrades={() => setImportingTrades(true)}
        />
        <main style={{ padding: '1.5rem', flex: 1 }}>
          {nav === 'dashboard' && <DashboardPage trades={filteredTrades} />}
          {nav === 'cockpit' && <RiskCockpitPage accounts={accounts} sessionsByAccountId={sessionsByAccountId} />}
          {nav === 'tradelog' && <TradeLogPage trades={filteredTrades} accounts={accounts} />}
          {nav === 'plan' && <PlanPage accounts={accounts} sessionsByAccountId={sessionsByAccountId} />}
        </main>
      </div>

      {addingTrade && <AddTradeDialog accounts={accounts} onClose={() => setAddingTrade(false)} />}
      {importingTrades && <ImportTradesDialog accounts={accounts} onClose={() => setImportingTrades(false)} />}
    </div>
  )
}
