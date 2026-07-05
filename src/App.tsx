import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account } from './db/schema'
import { todayISO } from './db/sessions'
import { AccountCard } from './components/AccountCard'
import { EditAccountDialog } from './components/EditAccountDialog'
import { LogSessionDialog } from './components/LogSessionDialog'
import { PayoutPlannerDialog } from './components/PayoutPlannerDialog'
import { FundedNextCycleDialog } from './components/FundedNextCycleDialog'
import { EquityCurveChart } from './components/EquityCurveChart'
import { ScenarioChart } from './components/ScenarioChart'
import { BackupControls } from './components/BackupControls'
import { DashboardSummary } from './components/DashboardSummary'
import { effectiveBreakerLevels } from './lib/breaker'

const FIRM_LABEL: Record<Account['firm'], string> = {
  fundednext: 'FundedNext',
  apex: 'Apex',
}

export default function App() {
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const sessions = useLiveQuery(() => db.sessions.toArray()) ?? []
  const [editing, setEditing] = useState<Account | null>(null)
  const [logging, setLogging] = useState<Account | null>(null)
  const [planningPayout, setPlanningPayout] = useState<Account | null>(null)
  const [trackingCycles, setTrackingCycles] = useState<Account | null>(null)

  const sessionsByAccountId = new Map<number, typeof sessions>()
  for (const s of sessions) {
    const list = sessionsByAccountId.get(s.accountId) ?? []
    list.push(s)
    sessionsByAccountId.set(s.accountId, list)
  }
  const breakerLevels = effectiveBreakerLevels(accounts, sessionsByAccountId, todayISO())

  const byFirm = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    ;(acc[a.firm] ??= []).push(a)
    return acc
  }, {})

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 1100, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '1rem' }}>
        <h1>Prop Tracker</h1>
        <BackupControls />
      </div>

      <DashboardSummary accounts={accounts} breakerLevels={breakerLevels} />

      {(Object.keys(byFirm) as Account['firm'][]).map((firm) => (
        <section key={firm} style={{ marginBottom: '2rem' }}>
          <h2>{FIRM_LABEL[firm]}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {byFirm[firm].map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                breaker={breakerLevels.get(a.id!) ?? 'ok'}
                onEdit={() => setEditing(a)}
                onLogSession={() => setLogging(a)}
                onPayoutPlanner={a.firm === 'apex' && a.stage === 'pa' ? () => setPlanningPayout(a) : undefined}
                onCycleTracker={a.firm === 'fundednext' && a.stage !== 'planned' ? () => setTrackingCycles(a) : undefined}
              />
            ))}
          </div>
        </section>
      ))}

      <section style={{ marginBottom: '2rem' }}>
        <h2>Progress vs plan</h2>
        <ScenarioChart
          actualFundedCapital={accounts
            .filter((a) => a.firm === 'fundednext' && a.stage === 'funded')
            .reduce((sum, a) => sum + a.balance, 0)}
          currentMonth={new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem' }}>
          {accounts.map((a) => (
            <EquityCurveChart key={a.id} account={a} sessions={sessionsByAccountId.get(a.id!) ?? []} />
          ))}
        </div>
      </section>

      {editing && <EditAccountDialog account={editing} onClose={() => setEditing(null)} />}
      {logging && <LogSessionDialog account={logging} onClose={() => setLogging(null)} />}
      {planningPayout && <PayoutPlannerDialog account={planningPayout} onClose={() => setPlanningPayout(null)} />}
      {trackingCycles && <FundedNextCycleDialog account={trackingCycles} onClose={() => setTrackingCycles(null)} />}
    </main>
  )
}
