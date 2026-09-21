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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { EmptyState, PageHeader } from '@/shared/ui/page'
import { BriefcaseIcon, ChevronDownIcon, PlusIcon } from 'lucide-react'

/* Converted onto shadcn Card, Badge, Button and Collapsible.
 *
 * The inactive-accounts disclosure was a button toggling a div, with a text
 * caret ("\u25be" / "\u25b8") for its only affordance and no `aria-expanded` —
 * so a screen reader was told nothing about whether the list was open. Radix's
 * Collapsible carries the state and the wiring. */

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
    { title: 'Evaluations & Challenges', accounts: evaluation, accent: 'var(--data-accent)' },
    { title: 'Live Accounts', accounts: live, accent: 'var(--data-accent)' },
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
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          <Button onClick={() => setAdding(true)} size="sm">
            <PlusIcon />
            Add account
          </Button>
        }
        description="Every prop-firm and live account side by side. The numbers on each card are the ones you entered — nothing here derives or enforces a firm's rules."
        title="Prop Firm Portfolio"
      />

      <DashboardSummary accounts={activeAccounts} ledgers={ledgers} />

      <FirmFinanceSection
        accounts={accounts}
        payouts={payouts}
        trades={trades}
        sessionsByAccountId={sessionsByAccountId}
        ledgers={ledgers}
      />

      {activeAccounts.length === 0 && (
        <EmptyState
          action={{ label: 'Add account', onClick: () => setAdding(true) }}
          description="Add a prop-firm evaluation, a funded account or a live broker account, and it appears here with whatever risk figures you enter for it."
          icon={<BriefcaseIcon />}
          title="No active accounts yet"
        />
      )}

      {groups.map((group) => {
        const totalBalance = group.accounts.reduce((sum, a) => sum + balanceOf(a), 0)
        return (
          <section className="flex flex-col gap-3" key={group.title}>
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-hidden
                className="h-3.5 w-0.5 rounded-full"
                style={{ background: group.accent }}
              />
              <h2 className="font-heading font-semibold text-sm uppercase tracking-wide">
                {group.title}
              </h2>
              <Badge variant="secondary">{group.accounts.length}</Badge>
              <span className="ml-auto text-muted-foreground text-xs tabular-nums">
                ${totalBalance.toLocaleString()} total
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
        <Collapsible onOpenChange={setShowInactive} open={showInactive}>
          <CollapsibleTrigger asChild>
            <Button className="text-muted-foreground" size="sm" variant="ghost">
              <ChevronDownIcon
                className={showInactive ? 'rotate-180 transition-transform' : 'transition-transform'}
              />
              Inactive accounts ({inactiveAccounts.length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <Card className="gap-0 py-0">
              <CardContent className="px-0">
              {inactiveAccounts.map((a) => {
                const firm = PROP_FIRMS.find((f) => f.id === a.firmId)
                const firmName = a.stage === 'live' ? 'Live account' : a.firmId === 'other' ? (a.customFirmName || 'Custom') : (firm?.name || a.firmId)
                return (
                  <div
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 last:border-b-0"
                    key={a.id}
                  >
                    <span className="min-w-0 flex-1 text-sm">
                      {a.label}
                      <span className="text-muted-foreground">
                        {' '}· {firmName} · ${a.size.toLocaleString()}
                      </span>
                    </span>
                    <Button onClick={() => handleActivate(a.id!)} size="xs" variant="outline">
                      Activate
                    </Button>
                  </div>
                )
              })}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
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
