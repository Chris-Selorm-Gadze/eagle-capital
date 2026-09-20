import { useLivePositions } from '../../liveposition/useLivePositions'
import { formatMoney, formatPnl } from '../../liveposition/ticker'
import { Card, CardContent } from '@/components/ui/card'
import { StatusIndicator } from '@/components/indicator'
import { cn } from 'cn'

/* Open risk, across every connected account, above the closed-trade history.
 *
 * Kept visibly separate from everything below it, and not folded into any of
 * it. The stats, the equity curve and the balance figure are built from closed
 * trades through utils/ledger.ts; unrealized P&L is neither realised nor
 * derivable from that ledger, and adding it to a balance would reintroduce
 * exactly the two-numbers-that-disagree problem the ledger exists to end.
 *
 * It renders nothing at all when no account is connected, rather than a row of
 * zeroes on a dashboard belonging to someone who only types trades in.
 *
 * Converted onto shadcn Card and the shared StatusIndicator, so the live dot
 * here and the one on the Live Trading page are the same component.
 */

function Item({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('font-semibold text-base tabular-nums', tone)}>{value}</span>
    </div>
  )
}

export function LiveStrip() {
  const { accounts, streaming, totals } = useLivePositions()

  if (accounts === null || accounts.length === 0) return null

  const toneFor = (n: number) =>
    n > 0 ? 'text-(--good-deep)' : n < 0 ? 'text-(--critical-deep)' : 'text-muted-foreground'

  return (
    <Card className="py-3">
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3">
        {/* One pair per currency. Adding a EUR account's P&L to a USD account's
            gives a headline number denominated in neither. */}
        {totals.byCurrency.map((c) => (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3" key={c.currency}>
            <Item
              label={`Open P&L${totals.singleCurrency ? '' : ` · ${c.currency}`}`}
              tone={toneFor(c.unrealized)}
              value={formatPnl(c.unrealized)}
            />
            <Item
              label={`Equity${totals.singleCurrency ? '' : ` · ${c.currency}`}`}
              value={formatMoney(c.equity)}
            />
          </div>
        ))}
        <Item label="Open positions" value={String(totals.open)} />
        <Item label="Connected" value={String(totals.accounts)} />

        <span className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground text-xs">
          <StatusIndicator pulse={streaming} tone={streaming ? 'good' : 'muted'} />
          {streaming ? 'live' : 'polling'}
        </span>
      </CardContent>
    </Card>
  )
}
