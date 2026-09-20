import { useState } from 'react'
import { EllipsisVerticalIcon, Trash2Icon } from 'lucide-react'
import type { Account } from '../../../db/schema'
import type { AccountLedger } from '../../../utils/ledger'
import { PROP_FIRMS } from '../propFirms'
import { deleteAccount } from '../../../db/accounts'
import { errorMessage } from '../../../utils/errors'
import { useConfirm } from '../../../shared/ui/confirm'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/* Converted onto shadcn Card, Badge and DropdownMenu.
 *
 * The actions menu was hand-rolled: a div toggled by state, positioned
 * absolutely, closed by a `mousedown` listener on the document. That gave it no
 * keyboard navigation, no Escape, no focus return on close, and no flipping when
 * the card sat near the bottom of the viewport — the menu on the last card in a
 * grid opened off-screen. Radix's menu handles all four, and portals so it can
 * never be clipped by the card's own bounds. */

const STAGE_LABEL: Record<Account['stage'], string> = {
  challenge: 'Challenge',
  phase2: 'Phase 2',
  verification: 'Verification',
  funded: 'Funded',
  evaluation: 'Evaluation',
  pa: 'PA',
  planned: 'Planned',
  blown: 'Blown',
  inactive: 'Inactive',
  live: 'Live',
}

// Purely presentational grouping by stage — not a computed risk/eligibility signal.
const STAGE_ACCENT: Record<Account['stage'], string> = {
  funded: 'var(--good)',
  pa: 'var(--good)',
  challenge: 'var(--data-accent)',
  phase2: 'var(--data-accent)',
  verification: 'var(--data-accent)',
  evaluation: 'var(--data-accent)',
  planned: 'var(--text-muted)',
  blown: 'var(--critical)',
  inactive: 'var(--text-muted)',
  live: 'var(--data-accent)',
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

export function AccountCard({
  account,
  ledger,
  onEdit,
  onLogSession,
  onPayoutPlanner,
  onScalingTracker,
  onDeleted,
}: {
  account: Account
  /** Derived balance/peak for this account. Absent only while data is still
   * loading, in which case the card falls back to the opening allocation
   * rather than inventing a number. */
  ledger?: AccountLedger
  onEdit: () => void
  onLogSession: () => void
  onPayoutPlanner?: () => void
  onScalingTracker?: () => void
  onDeleted: () => void
}) {
  const confirm = useConfirm()
  const firm = PROP_FIRMS.find((f) => f.id === account.firmId)
  const firmName = account.stage === 'live'
    ? 'Live account'
    : account.firmId === 'other'
      ? (account.customFirmName || 'Custom Firm')
      : (firm?.name || account.firmId)
  const accent = STAGE_ACCENT[account.stage]
  // Derived, not the stored `accounts.balance` column — logging a trade never
  // moved that column, so this card showed the opening allocation forever for
  // anyone who logged trades instead of daily sessions.
  const balance = ledger?.balance ?? account.size
  const netPnl = balance - account.size

  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!(await confirm({ title: `Delete ${account.label}?`, description: 'This also deletes all sessions, trades, payouts and rewards logged against it. This cannot be undone.', confirmLabel: 'Delete account', destructive: true }))) return
    setDeleting(true)
    try {
      await deleteAccount(account.id!)
      onDeleted()
    } catch (err) {
      toast.error(errorMessage(err))
      setDeleting(false)
    }
  }

  // Plain display of whatever the user typed in — no derived room/gate/pass-fail logic.
  const miniStats: { label: string; value: string }[] = []
  if (account.profitTarget !== undefined) miniStats.push({ label: 'Profit target', value: money(account.profitTarget) })
  if (account.maxDrawdown !== undefined) miniStats.push({ label: 'Max drawdown', value: money(account.maxDrawdown) })
  if (account.dailyLossLimit !== undefined) miniStats.push({ label: 'Daily loss limit', value: money(account.dailyLossLimit) })
  if (account.minTradingDays !== undefined) miniStats.push({ label: 'Min trading days', value: String(account.minTradingDays) })

  return (
    <Card
      className="gap-0"
      // The stage rail. An inset shadow rather than a left border, so it can't
      // shift the card's own edge or fight its radius.
      style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
    >
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="truncate">{account.label}</CardTitle>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {firmName} · {money(account.size)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge style={{ borderColor: accent, color: accent }} variant="outline">
            {STAGE_LABEL[account.stage]}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="Account actions" disabled={deleting} size="icon-sm" variant="ghost">
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onLogSession}>Log session</DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              {onPayoutPlanner && (
                <DropdownMenuItem onClick={onPayoutPlanner}>Payout planner</DropdownMenuItem>
              )}
              {onScalingTracker && (
                <DropdownMenuItem onClick={onScalingTracker}>Scaling rules</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete} variant="destructive">
                <Trash2Icon />
                Delete account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="mt-3 flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-muted-foreground text-xs">Balance</div>
            <div className="font-semibold text-xl tabular-nums">{money(balance)}</div>
          </div>
          <div
            className="font-semibold text-sm tabular-nums"
            style={{ color: netPnl >= 0 ? 'var(--good-deep)' : 'var(--critical-deep)' }}
          >
            {netPnl >= 0 ? '+' : '-'}{money(Math.abs(netPnl))}
          </div>
        </div>

        {miniStats.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3">
            {miniStats.map((s) => (
              <div key={s.label}>
                <div className="text-muted-foreground text-[0.7rem]">{s.label}</div>
                <div className="text-sm tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {account.fundedDate && (
          <p className="text-muted-foreground text-xs">Funded {account.fundedDate}</p>
        )}
      </CardContent>
    </Card>
  )
}
