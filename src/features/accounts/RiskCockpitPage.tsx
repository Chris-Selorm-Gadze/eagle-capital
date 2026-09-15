import { useState } from 'react'
import type { Account, Payout, Reward, SessionLog, Trade } from '../../db/schema'
import type { AccountLedger } from '../../utils/ledger'
import { tradingDayOf } from '../../utils/tradingDay'
import { setAccountActive } from '../../db/accounts'
import { AccountCard } from './components/AccountCard'
import { EditAccountDialog } from './components/EditAccountDialog'
import { AddAccountDialog } from './components/AddAccountDialog'
import { LogSessionDialog } from './components/LogSessionDialog'
import { PayoutPlannerDialog } from './components/PayoutPlannerDialog'
import { ScalingCycleDialog } from './components/ScalingCycleDialog'
import { DashboardSummary } from './components/DashboardSummary'
import { FirmFinanceSection } from './components/FirmFinanceSection'
import { PROP_FIRMS } from './propFirms'
import styles from './RiskCockpitPage.module.css'

interface AccountGroup {
  title: string
  accounts: Account[]
  accent: string
}

export function RiskCockpitPage({
  accounts,
  payouts,
  rewards,
  trades,
  sessionsByAccountId,
  ledgers,
  userId,
  onChanged,
}: {
  accounts: Account[]
  payouts: Payout[]
  rewards: Reward[]
  trades: Trade[]
  sessionsByAccountId: Map<string, SessionLog[]>
  /** Derived balances, keyed by account id — the one definition of what an
   * account is worth (utils/ledger.ts). */
  ledgers: Map<string, AccountLedger>
  userId: string
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<Account | null>(null)
  const [logging, setLogging] = useState<Account | null>(null)
  const [planningPayout, setPlanningPayout] = useState<Account | null>(null)
  const [trackingCycles, setTrackingCycles] = useState<Account | null>(null)
  const [adding, setAdding] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const activeAccounts = accounts.filter((a) => a.active)
  const inactiveAccounts = accounts.filter((a) => !a.active)

  // Group active accounts by category
  const funded = activeAccounts.filter((a) => a.stage === 'funded' || a.stage === 'pa')
  const evaluation = activeAccounts.filter((a) => ['challenge', 'phase2', 'verification', 'evaluation'].includes(a.stage))
  const live = activeAccounts.filter((a) => a.stage === 'live')
  const planned = activeAccounts.filter((a) => a.stage === 'planned')
  const blown = activeAccounts.filter((a) => a.stage === 'blown' || a.stage === 'inactive')

  const groups: AccountGroup[] = [
    { title: 'Funded Portfolio', accounts: funded, accent: 'var(--good)' },
    { title: 'Evaluations & Challenges', accounts: evaluation, accent: 'var(--accent)' },
    { title: 'Live Accounts', accounts: live, accent: 'var(--accent)' },
    { title: 'Planned Accounts', accounts: planned, accent: 'var(--text-muted)' },
    { title: 'Blown & Inactive', accounts: blown, accent: 'var(--critical)' },
  ].filter((g) => g.accounts.length > 0)

  const balanceOf = (a: Account) => (a.id ? ledgers.get(a.id)?.balance ?? a.size : a.size)

  const tradeDaysByAccount = new Map<string, Set<string>>()
  for (const t of trades) {
    const day = tradingDayOf(t.entryTime)
    if (!day) continue
    const set = tradeDaysByAccount.get(t.accountId)
    if (set) set.add(day)
    else tradeDaysByAccount.set(t.accountId, new Set([day]))
  }

  async function handleActivate(id: string) {
    await setAccountActive(id, true)
    onChanged()
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className="page-title">Prop Firm Portfolio</h1>
        <button onClick={() => setAdding(true)} className="btn-primary">+ Add Account</button>
      </div>

      <DashboardSummary accounts={activeAccounts} ledgers={ledgers} />

      <FirmFinanceSection
        accounts={accounts}
        payouts={payouts}
        trades={trades}
        sessionsByAccountId={sessionsByAccountId}
        ledgers={ledgers}
      />

      {activeAccounts.length === 0 && (
        <div className={styles.emptyState}>
          No active accounts yet. Click "+ Add Account" to get started.
        </div>
      )}

      {groups.map((group) => {
        const totalBalance = group.accounts.reduce((sum, a) => sum + balanceOf(a), 0)
        return (
          <section key={group.title} style={{ marginBottom: '2rem' }}>
            <div className={styles.groupHeader}>
              <span className={styles.groupAccent} style={{ background: group.accent }} />
              <h2 className={styles.firmTitle}>{group.title}</h2>
              <span className={styles.groupCount}>{group.accounts.length}</span>
              <span className={styles.groupTotal}>${totalBalance.toLocaleString()} total</span>
            </div>
            <div className={styles.accountsGrid}>
              {group.accounts.map((a) => (
                <AccountCard
                  key={a.id}
                  account={a}
                  ledger={a.id ? ledgers.get(a.id) : undefined}
                  onEdit={() => setEditing(a)}
                  onLogSession={() => setLogging(a)}
                  onPayoutPlanner={['funded', 'pa'].includes(a.stage) ? () => setPlanningPayout(a) : undefined}
                  onScalingTracker={['funded', 'pa'].includes(a.stage) ? () => setTrackingCycles(a) : undefined}
                  onDeleted={onChanged}
                />
              ))}
            </div>
          </section>
        )
      })}

      {inactiveAccounts.length > 0 && (
        <section>
          <button onClick={() => setShowInactive(!showInactive)} className={styles.inactiveToggle}>
            {showInactive ? '▾' : '▸'} Inactive accounts ({inactiveAccounts.length})
          </button>
          {showInactive && (
            <div className={styles.inactiveList}>
              {inactiveAccounts.map((a) => {
                const firm = PROP_FIRMS.find((f) => f.id === a.firmId)
                const firmName = a.stage === 'live' ? 'Live account' : a.firmId === 'other' ? (a.customFirmName || 'Custom') : (firm?.name || a.firmId)
                return (
                  <div key={a.id} className={styles.inactiveRow}>
                    <span className={styles.inactiveLabel}>
                      {a.label}
                      <span className={styles.inactiveMeta}> · {firmName} · ${a.size.toLocaleString()}</span>
                    </span>
                    <button onClick={() => handleActivate(a.id!)}>Activate</button>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {editing && (
        <EditAccountDialog
          account={editing}
          ledger={editing.id ? ledgers.get(editing.id) : undefined}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
      {logging && (
        <LogSessionDialog
          account={logging}
          sessions={sessionsByAccountId.get(logging.id!) ?? []}
          hasTradesOn={(date) => tradeDaysByAccount.get(logging.id!)?.has(date) ?? false}
          userId={userId}
          onClose={() => setLogging(null)}
          onSaved={onChanged}
        />
      )}
      {planningPayout && (
        <PayoutPlannerDialog
          account={planningPayout}
          payouts={payouts.filter((p) => p.accountId === planningPayout.id)}
          userId={userId}
          onClose={() => setPlanningPayout(null)}
          onSaved={onChanged}
        />
      )}
      {trackingCycles && (
        <ScalingCycleDialog
          account={trackingCycles}
          rewards={rewards.filter((r) => r.accountId === trackingCycles.id)}
          userId={userId}
          onClose={() => setTrackingCycles(null)}
          onSaved={onChanged}
        />
      )}
      {adding && <AddAccountDialog userId={userId} onClose={() => setAdding(false)} onSaved={onChanged} forceKind="prop" />}
    </div>
  )
}
