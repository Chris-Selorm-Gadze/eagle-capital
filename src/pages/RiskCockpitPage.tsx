import { useState } from 'react'
import type { Account, SessionLog } from '../db/schema'
import { todayISO } from '../db/sessions'
import { AccountCard } from '../components/AccountCard'
import { EditAccountDialog } from '../components/EditAccountDialog'
import { LogSessionDialog } from '../components/LogSessionDialog'
import { PayoutPlannerDialog } from '../components/PayoutPlannerDialog'
import { FundedNextCycleDialog } from '../components/FundedNextCycleDialog'
import { DashboardSummary } from '../components/DashboardSummary'
import { effectiveBreakerLevels } from '../lib/breaker'

const FIRM_LABEL: Record<Account['firm'], string> = {
  fundednext: 'FundedNext',
  apex: 'Apex',
}

export function RiskCockpitPage({
  accounts,
  sessionsByAccountId,
}: {
  accounts: Account[]
  sessionsByAccountId: Map<number, SessionLog[]>
}) {
  const [editing, setEditing] = useState<Account | null>(null)
  const [logging, setLogging] = useState<Account | null>(null)
  const [planningPayout, setPlanningPayout] = useState<Account | null>(null)
  const [trackingCycles, setTrackingCycles] = useState<Account | null>(null)

  const breakerLevels = effectiveBreakerLevels(accounts, sessionsByAccountId, todayISO())

  const byFirm = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    ;(acc[a.firm] ??= []).push(a)
    return acc
  }, {})

  return (
    <div>
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

      {editing && <EditAccountDialog account={editing} onClose={() => setEditing(null)} />}
      {logging && <LogSessionDialog account={logging} onClose={() => setLogging(null)} />}
      {planningPayout && <PayoutPlannerDialog account={planningPayout} onClose={() => setPlanningPayout(null)} />}
      {trackingCycles && <FundedNextCycleDialog account={trackingCycles} onClose={() => setTrackingCycles(null)} />}
    </div>
  )
}
