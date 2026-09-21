import { createContext, memo, useContext, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AuthPage } from '../auth/AuthPage'
import {
  freshnessLabel,
  snapshotAgeSeconds,
  type LiveAccountPositions,
  type LivePosition,
} from '../../db/livePositions'
import { useLivePositions } from './useLivePositions'
import { accountUnrealized } from './totals'
import type { Tick } from './ticker'
import {
  formatDuration,
  formatLots,
  formatMoney,
  formatPnl,
  formatPrice,
  tickOf,
} from './ticker'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { StatusIndicator } from '@/components/indicator'
import { EmptyState, ErrorNotice, LoadingRows, PageHeader } from '@/shared/ui/page'
import { cn } from 'cn'
import { RadioIcon } from 'lucide-react'
import styles from './LivePositionsPage.module.css'

/* Every connected account's open positions, as they move.
 *
 * Rows arrive by Postgres realtime, so a snapshot reaches the screen when the
 * worker writes it rather than at the next poll. What the page can never do is
 * imply one freshness across all of it: MT5 allows one login per terminal, so
 * each account is as current as the last time the worker was attached to it,
 * and each says so.
 *
 * The clock ticks once a second on its own so ages and durations keep counting
 * between updates — without it a position that opened forty seconds ago would
 * read "40s" until the next price moved.
 *
 * Converted onto shadcn Card + Table. The module stylesheet keeps only what
 * shadcn has no equivalent for: the tick flash keyframes, and the numeric
 * alignment the price columns need.
 */

/* One clock, read only by the cells that count up.
 *
 * Passing `now` down as a prop made every memo on this page dead weight: each
 * row re-rendered once a second to move one column, whether or not a price had
 * changed. Through a context, the tick reaches the age cells and nothing else,
 * so a row repaints when its numbers move and not otherwise. */
const ClockContext = createContext(0)

function Clock({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [])
  return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>
}

/** How long a position has been open, counting up on its own. */
function Elapsed({ openedAt }: { openedAt: string | null }) {
  return <>{formatDuration(openedAt, useContext(ClockContext))}</>
}

/** How long ago the worker last read this account. */
function Freshness({ reportedAt, offline }: { reportedAt: string | null; offline: boolean }) {
  const age = snapshotAgeSeconds(reportedAt, useContext(ClockContext))
  // Past a minute the reading is old enough that the number beside it may not
  // be the position's real P&L any more, and the page should say so in colour
  // rather than leaving it to be read off a timestamp.
  const stale = age !== null && age > 60
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusIndicator
        pulse={!offline && !stale}
        tone={offline ? 'critical' : stale ? 'warning' : 'good'}
      />
      <span
        className={cn(
          'text-xs',
          offline ? 'text-(--critical)' : stale ? 'text-(--warning)' : 'text-muted-foreground',
        )}
      >
        {offline ? 'disconnected' : freshnessLabel(age)}
      </span>
    </span>
  )
}

function pnlClass(n: number): string {
  if (n > 0) return 'text-(--good-deep) font-semibold'
  if (n < 0) return 'text-(--critical-deep) font-semibold'
  return 'text-muted-foreground'
}

/** A cell that flashes in the direction its number moved.
 *
 * State adjusted during render rather than refs mutated during render: this
 * tree runs under StrictMode, which renders twice, and a ref written on the
 * first pass makes the second pass see no change and drop the flash. React
 * supports this shape explicitly -- compare against the previous value held in
 * state, and set both when it differs.
 *
 * The flash is driven by a changing key rather than a class, because the same
 * direction arriving tick after tick would not restart a CSS animation that is
 * already on the element. */
function TickCell({ value, text, className }: {
  value: number | null
  text: string
  className?: string
}) {
  const [previous, setPrevious] = useState<number | null>(value)
  const [tick, setTick] = useState<{ direction: Tick; generation: number }>({
    direction: 'none',
    generation: 0,
  })

  if (value !== previous) {
    const direction = tickOf(previous, value)
    setPrevious(value)
    setTick((t) => (direction === 'none' ? t : { direction, generation: t.generation + 1 }))
  }

  const flash = tick.direction === 'up'
    ? styles.tickUp
    : tick.direction === 'down' ? styles.tickDown : ''
  return (
    <span className={cn('rounded px-1 tabular-nums', className, flash)} key={tick.generation}>
      {text}
    </span>
  )
}

const PositionRow = memo(function PositionRow({ position }: { position: LivePosition }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{position.symbol}</TableCell>
      <TableCell>
        <Badge
          className="uppercase"
          variant={position.side === 'long' ? 'secondary' : 'outline'}
        >
          {position.side}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatLots(position.volume)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatPrice(position.openPrice, position.digits)}
      </TableCell>
      <TableCell className="text-right">
        <TickCell
          text={formatPrice(position.currentPrice, position.digits)}
          value={position.currentPrice}
        />
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        <Elapsed openedAt={position.openedAt} />
      </TableCell>
      <TableCell className="text-right">
        <TickCell
          className={pnlClass(position.unrealizedPnl)}
          text={formatPnl(position.unrealizedPnl)}
          value={position.unrealizedPnl}
        />
      </TableCell>
    </TableRow>
  )
})

const AccountPanel = memo(function AccountPanel({ account }: { account: LiveAccountPositions }) {
  const offline = account.connectionStatus !== 'connected'
  const open = accountUnrealized(account)

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex-wrap gap-x-3 gap-y-2 border-b py-3">
        <CardTitle className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">{account.label}</span>
          <span className="shrink-0 font-normal text-muted-foreground text-xs">
            {account.broker}
          </span>
        </CardTitle>
        {/* Reads left to right in order of how often it changes: open P&L moves
            every tick, equity on every close, balance rarely, and the freshness
            says how far to trust the three of them. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
          {account.positions.length > 0 && (
            <span>
              Open <strong className={cn('tabular-nums', pnlClass(open))}>{formatPnl(open)}</strong>
            </span>
          )}
          {account.equity !== null && (
            <span>
              Equity{' '}
              <strong className="text-foreground tabular-nums">{formatMoney(account.equity)}</strong>
            </span>
          )}
          {account.balance !== null && (
            <span>
              Balance{' '}
              <strong className="text-foreground tabular-nums">{formatMoney(account.balance)}</strong>
            </span>
          )}
          <Freshness offline={offline} reportedAt={account.reportedAt} />
        </div>
      </CardHeader>

      {account.reportedAt === null ? (
        <CardContent className="py-6 text-muted-foreground text-sm">
          {offline
            ? 'Not connected — the worker has not been able to read this account.'
            : 'Waiting for the worker’s first read of this account.'}
        </CardContent>
      ) : account.positions.length === 0 ? (
        <CardContent className="py-6 text-muted-foreground text-sm">Flat.</CardContent>
      ) : (
        <CardContent className="px-0">
          <div className={styles.tableScroll}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Lots</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Last</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                  <TableHead className="text-right">P&amp;L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {account.positions.map((p) => (
                  <PositionRow key={`${account.accountId}:${p.ticket}`} position={p} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  )
})

/** One figure in the summary strip. */
function Summary({ label, value, valueClass }: {
  label: string
  value: string | number
  valueClass?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('font-semibold text-lg tabular-nums', valueClass)}>{value}</span>
    </div>
  )
}

function LivePositionsWorkspace() {
  const { accounts, error, streaming, totals } = useLivePositions()

  if (accounts === null) {
    // A failure before the first snapshot is the whole page; after one, it sits
    // above the data rather than replacing it (below).
    return error ? <ErrorNotice message={error} /> : <LoadingRows rows={3} />
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorNotice message={error} />}

      <Card className="py-3">
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3">
          {/* One pair per currency held. MT5 reports profit in each account's own
              currency, so a desk spanning two of them gets two subtotals rather
              than one figure denominated in neither. */}
          {totals.byCurrency.map((c) => (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3" key={c.currency}>
              <Summary
                label={`Unrealized${totals.singleCurrency ? '' : ` · ${c.currency}`}`}
                value={formatPnl(c.unrealized)}
                valueClass={pnlClass(c.unrealized)}
              />
              <Summary
                label={`Equity${totals.singleCurrency ? '' : ` · ${c.currency}`}`}
                value={formatMoney(c.equity)}
              />
            </div>
          ))}
          <Summary label="Open" value={totals.open} />
          <Summary label="Accounts" value={totals.accounts} />

          <span className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground text-xs">
            <StatusIndicator pulse={streaming} tone={streaming ? 'good' : 'muted'} />
            {streaming ? 'streaming' : 'polling'}
          </span>
        </CardContent>
      </Card>

      {accounts.length === 0 ? (
        <EmptyState
          description="Connect an account on the Trade Copier page and its open positions appear here."
          icon={<RadioIcon />}
          title="No connected accounts yet"
        />
      ) : (
        <Clock>
          <div className="grid gap-4 xl:grid-cols-2">
            {accounts.map((a) => <AccountPanel account={a} key={a.accountId} />)}
          </div>
        </Clock>
      )}
    </div>
  )
}

export function LivePositionsPage() {
  const { user, loading } = useAuth()

  if (loading) return null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        description="Every connected account’s open positions, updating as they move. Each account shows when the worker last read it — one login can attach to a terminal at a time, so an account being copied is read continuously and an idle one on its own sweep."
        title="Live Trading"
      />

      {!user ? (
        <>
          <p className="text-muted-foreground text-sm">Sign in to see your live positions.</p>
          <AuthPage />
        </>
      ) : (
        <LivePositionsWorkspace />
      )}
    </div>
  )
}
