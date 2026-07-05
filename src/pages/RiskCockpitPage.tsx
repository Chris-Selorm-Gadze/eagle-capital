import { useState } from 'react'
import type { Account, SessionLog } from '../db/schema'
import { todayISO } from '../db/sessions'
import { setAccountActive } from '../db/accounts'
import { AccountCard } from '../components/AccountCard'
import { EditAccountDialog } from '../components/EditAccountDialog'
import { AddAccountDialog } from '../components/AddAccountDialog'
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
  const [adding, setAdding] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const activeAccounts = accounts.filter((a) => a.active)
  const inactiveAccounts = accounts.filter((a) => !a.active)

  const breakerLevels = effectiveBreakerLevels(activeAccounts, sessionsByAccountId, todayISO())

  const byFirm = activeAccounts.reduce<Record<string, Account[]>>((acc, a) => {
    ;(acc[a.firm] ??= []).push(a)
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Prop Firm Management</h1>
        <button onClick={() => setAdding(true)} style={{ background: 'var(--accent)', border: '1px solid var(--accent)' }}>
          + Add Account
        </button>
      </div>

      <DashboardSummary accounts={activeAccounts} breakerLevels={breakerLevels} />

      {activeAccounts.length === 0 && (
        <div style={{
          padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)',
          border: '1px dashed var(--border)', borderRadius: 8,
        }}>
          No active accounts yet. Click "+ Add Account" to get started.
        </div>
      )}

      {(Object.keys(byFirm) as Account['firm'][]).map((firm) => (
        <section key={firm}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>{FIRM_LABEL[firm]}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
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

      {inactiveAccounts.length > 0 && (
        <section>
          <button
            onClick={() => setShowInactive(!showInactive)}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-secondary)',
              padding: 0, cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            {showInactive ? '▾' : '▸'} Inactive accounts ({inactiveAccounts.length})
          </button>
          {showInactive && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {inactiveAccounts.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.6rem 0.9rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {a.label}
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · {FIRM_LABEL[a.firm]} · ${a.size.toLocaleString()}</span>
                  </span>
                  <button onClick={() => setAccountActive(a.id!, true)}>Activate</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {editing && <EditAccountDialog account={editing} onClose={() => setEditing(null)} />}
      {logging && <LogSessionDialog account={logging} onClose={() => setLogging(null)} />}
      {planningPayout && <PayoutPlannerDialog account={planningPayout} onClose={() => setPlanningPayout(null)} />}
      {trackingCycles && <FundedNextCycleDialog account={trackingCycles} onClose={() => setTrackingCycles(null)} />}
      {adding && <AddAccountDialog onClose={() => setAdding(false)} />}
    </div>
  )
}
