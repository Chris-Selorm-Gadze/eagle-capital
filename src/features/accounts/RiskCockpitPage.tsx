import { useState } from 'react'
import type { Account, Payout, SessionLog } from '../../db/schema'
import { todayISO } from '../../db/sessions'
import { setAccountActive } from '../../db/accounts'
import { AccountCard } from './components/AccountCard'
import { EditAccountDialog } from './components/EditAccountDialog'
import { AddAccountDialog } from './components/AddAccountDialog'
import { LogSessionDialog } from './components/LogSessionDialog'
import { PayoutPlannerDialog } from './components/PayoutPlannerDialog'
import { ScalingCycleDialog } from './components/ScalingCycleDialog'
import { DashboardSummary } from './components/DashboardSummary'
import { FirmFinanceSection } from './components/FirmFinanceSection'
import { effectiveBreakerLevels } from '../risk/breaker'
import { PROP_FIRMS } from './propFirms'
import styles from './RiskCockpitPage.module.css'

interface AccountGroup {
  title: string
  accounts: Account[]
}

export function RiskCockpitPage({
  accounts,
  payouts,
  sessionsByAccountId,
}: {
  accounts: Account[]
  payouts: Payout[]
  sessionsByAccountId: Map<number, SessionLog[]>
}) {
  const [editing, setEditing] = useState<Account | null>(null)
  const [logging, setLogging] = useState<Account | null>(null)
  const [planningPayout, setPlanningPayout] = useState<Account | null>(null)
  const [trackingCycles, setTrackingCycles] = useState<Account | null>(null)
  const [adding, setAdding] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const activeAccounts = accounts.filter((a) => a.active)
  const inactiveAccounts = accounts.filter((a) => !a.active)

  const breakerLevels = effectiveBreakerLevels(activeAccounts, sessionsByAccountId, todayISO())

  // Group active accounts by category
  const funded = activeAccounts.filter((a) => a.stage === 'funded' || a.stage === 'pa')
  const evaluation = activeAccounts.filter((a) => ['challenge', 'phase2', 'verification', 'evaluation'].includes(a.stage))
  const planned = activeAccounts.filter((a) => a.stage === 'planned')
  const blown = activeAccounts.filter((a) => a.stage === 'blown' || a.stage === 'inactive')

  const groups: AccountGroup[] = [
    { title: 'Funded Portfolio', accounts: funded },
    { title: 'Evaluations & Challenges', accounts: evaluation },
    { title: 'Planned Accounts', accounts: planned },
    { title: 'Blown & Inactive', accounts: blown },
  ].filter((g) => g.accounts.length > 0)

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className="page-title">Prop Firm Portfolio</h1>
        <button onClick={() => setAdding(true)} className="btn-primary">+ Add Account</button>
      </div>

      <DashboardSummary accounts={activeAccounts} breakerLevels={breakerLevels} />

      <FirmFinanceSection accounts={accounts} payouts={payouts} sessionsByAccountId={sessionsByAccountId} />

      {activeAccounts.length === 0 && (
        <div className={styles.emptyState}>
          No active accounts yet. Click "+ Add Account" to get started.
        </div>
      )}

      {groups.map((group) => (
        <section key={group.title} style={{ marginBottom: '2rem' }}>
          <h2 className={styles.firmTitle}>{group.title}</h2>
          <div className={styles.accountsGrid}>
            {group.accounts.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                breaker={breakerLevels.get(a.id!) ?? 'ok'}
                onEdit={() => setEditing(a)}
                onLogSession={() => setLogging(a)}
                onPayoutPlanner={['funded', 'pa'].includes(a.stage) ? () => setPlanningPayout(a) : undefined}
                onScalingTracker={['funded', 'pa'].includes(a.stage) ? () => setTrackingCycles(a) : undefined}
              />
            ))}
          </div>
        </section>
      ))}

      {inactiveAccounts.length > 0 && (
        <section>
          <button onClick={() => setShowInactive(!showInactive)} className={styles.inactiveToggle}>
            {showInactive ? '▾' : '▸'} Inactive accounts ({inactiveAccounts.length})
          </button>
          {showInactive && (
            <div className={styles.inactiveList}>
              {inactiveAccounts.map((a) => {
                const firm = PROP_FIRMS.find((f) => f.id === a.firmId)
                const firmName = a.firmId === 'other' ? (a.customFirmName || 'Custom') : (firm?.name || a.firmId)
                return (
                  <div key={a.id} className={styles.inactiveRow}>
                    <span className={styles.inactiveLabel}>
                      {a.label}
                      <span className={styles.inactiveMeta}> · {firmName} · ${a.size.toLocaleString()}</span>
                    </span>
                    <button onClick={() => setAccountActive(a.id!, true)}>Activate</button>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {editing && <EditAccountDialog account={editing} onClose={() => setEditing(null)} />}
      {logging && <LogSessionDialog account={logging} onClose={() => setLogging(null)} />}
      {planningPayout && <PayoutPlannerDialog account={planningPayout} onClose={() => setPlanningPayout(null)} />}
      {trackingCycles && <ScalingCycleDialog account={trackingCycles} onClose={() => setTrackingCycles(null)} />}
      {adding && <AddAccountDialog onClose={() => setAdding(false)} />}
    </div>
  )
}
