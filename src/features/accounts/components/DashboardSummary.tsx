import type { Account } from '../../../db/schema'
import type { AccountLedger } from '../../../utils/ledger'
import { StatTile } from '../../../shared/ui/StatTile'
import { Card, CardContent } from '@/components/ui/card'

/* Converted onto shadcn Card. The allocation bar stays a flex row of three
 * weighted segments — `flex: <amount>` is doing real proportional work that a
 * utility class can't express — but its colours now come from the same tokens
 * the tiles beneath it use, so a segment and its figure always match. */

export function DashboardSummary({
  accounts,
  ledgers,
}: {
  accounts: Account[]
  ledgers: Map<string, AccountLedger>
}) {
  // Derived balances — see utils/ledger.ts. The stored column this used to read
  // only moved when a session or payout was logged, never when a trade was.
  const balanceOf = (a: Account) => (a.id ? ledgers.get(a.id)?.balance ?? a.size : a.size)

  const totalCapital = accounts.reduce((sum, a) => sum + balanceOf(a), 0)

  const fundedCapital = accounts
    .filter((a) => a.stage === 'funded' || a.stage === 'pa')
    .reduce((sum, a) => sum + balanceOf(a), 0)

  const challengeCapital = accounts
    .filter((a) => ['challenge', 'phase2', 'verification', 'evaluation'].includes(a.stage))
    .reduce((sum, a) => sum + a.size, 0)

  const otherCapital = Math.max(0, totalCapital - fundedCapital - challengeCapital)

  const pct = (n: number) => (totalCapital > 0 ? Math.round((n / totalCapital) * 100) : 0)

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-muted-foreground text-xs">Total capital under management</div>
            <div className="font-semibold text-3xl tabular-nums">
              ${totalCapital.toLocaleString()}
            </div>
          </div>
          <div className="text-muted-foreground text-xs">
            {accounts.length} active account{accounts.length === 1 ? '' : 's'}
          </div>
        </div>

        {totalCapital > 0 && (
          <div
            aria-label={`Allocation: ${pct(fundedCapital)}% funded, ${pct(challengeCapital)}% in challenges, ${pct(otherCapital)}% other`}
            className="flex h-1.5 gap-px overflow-hidden rounded-full"
            role="img"
          >
            {fundedCapital > 0 && (
              <div style={{ flex: fundedCapital, background: 'var(--good)' }} />
            )}
            {challengeCapital > 0 && (
              <div style={{ flex: challengeCapital, background: 'var(--data-accent)' }} />
            )}
            {otherCapital > 0 && (
              <div style={{ flex: otherCapital, background: 'var(--text-muted)' }} />
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile
            badge={totalCapital > 0 ? `${pct(fundedCapital)}%` : undefined}
            color="var(--good-deep)"
            label="Total funded capital"
            value={`$${fundedCapital.toLocaleString()}`}
          />
          <StatTile
            badge={totalCapital > 0 ? `${pct(challengeCapital)}%` : undefined}
            color="var(--data-accent)"
            label="Challenge size"
            value={`$${challengeCapital.toLocaleString()}`}
          />
          {otherCapital > 0 && (
            <StatTile
              badge={`${pct(otherCapital)}%`}
              color="var(--text-muted)"
              label="Other / planned"
              value={`$${otherCapital.toLocaleString()}`}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
