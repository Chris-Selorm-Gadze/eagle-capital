import { useEffect, useMemo, useState } from 'react'
import type { Trade } from '../../../db/schema'
import { byMostRecentClose } from '../../../utils/tradeOrder'
import { useMoney } from '@/components/money-context'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from 'cn'
import styles from './RecentTradesTable.module.css'

/* One table, two jobs.
 *
 * With `limit` it is the dashboard's "last eight trades" tile. Without it, it is
 * the entire Trade Log — and that version used to render every row it was given
 * in page flow. At a few hundred trades the page ran for tens of thousands of
 * pixels, the "Delete all" button and the account filter scrolled out of reach
 * above it, and finding one trade meant scrolling past all the others. So the
 * unbounded version pages, filters, and scrolls inside its own box; the limited
 * one is untouched.
 *
 * Converted onto shadcn Card + Table + Select + Input. Because both callers
 * share it, this also brings the dashboard's tile along. */

const PAGE_SIZE = 25

type SideFilter = 'all' | 'long' | 'short'
type OutcomeFilter = 'all' | 'wins' | 'losses'

export function RecentTradesTable({
  trades,
  title = 'Recent trades',
  limit,
  onEdit,
  onDelete,
  onVisibleChange,
}: {
  trades: Trade[]
  title?: string
  limit?: number
  onEdit?: (trade: Trade) => void
  onDelete?: (id: string) => void
  /** The rows the filters currently leave visible (every page of them, not just
   * the one on screen). The Trade Log's "Delete all" acts on exactly this, so
   * the button can never delete rows the filters are hiding. */
  onVisibleChange?: (visible: Trade[]) => void
}) {
  const { signedExact: signedMoney } = useMoney()
  const [query, setQuery] = useState('')
  const [side, setSide] = useState<SideFilter>('all')
  const [outcome, setOutcome] = useState<OutcomeFilter>('all')
  const [page, setPage] = useState(0)

  // Most recently CLOSED first. This sorted on the day string alone, with a
  // comparator that never returned 0 -- so a day's trades came out in no
  // particular order, and the dashboard's "last eight" could leave out the
  // trade that had just closed. A position held overnight also sorted under the
  // day it opened. `byMostRecentClose` is total, so the order is stable.
  const sorted = useMemo(() => [...trades].sort(byMostRecentClose), [trades])

  /* The tile version shows exactly what it was asked for. Everything below —
   * filters, paging, the inner scroller — belongs to the full log only. */
  const isLog = limit === undefined

  const filtered = useMemo(() => {
    if (!isLog) return sorted
    const needle = query.trim().toUpperCase()
    return sorted.filter((t) => {
      if (needle && !t.symbol.toUpperCase().includes(needle)) return false
      if (side !== 'all' && t.side !== side) return false
      if (outcome === 'wins' && t.pnl <= 0) return false
      if (outcome === 'losses' && t.pnl >= 0) return false
      return true
    })
  }, [sorted, isLog, query, side, outcome])

  useEffect(() => {
    onVisibleChange?.(filtered)
    // The callback is an inline arrow at every call site; depending on it would
    // re-run this on each parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  /* Narrowing the filter can strand you past the last page. */
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])

  const safePage = Math.min(page, pageCount - 1)
  const rows = isLog
    ? filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
    : sorted.slice(0, limit)

  const showActions = Boolean(onEdit || onDelete)
  const filtersActive = query.trim() !== '' || side !== 'all' || outcome !== 'all'

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-3">
        <CardTitle>{title}</CardTitle>
      </CardHeader>

      {isLog && sorted.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 border-b px-4 py-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs" htmlFor="tradelog-symbol">
              Symbol
            </Label>
            <Input
              className="h-8 w-32"
              id="tradelog-symbol"
              onChange={(e) => { setQuery(e.target.value); setPage(0) }}
              placeholder="e.g. NQ"
              type="search"
              value={query}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs" htmlFor="tradelog-side">Side</Label>
            <Select
              onValueChange={(v) => { setSide(v as SideFilter); setPage(0) }}
              value={side}
            >
              <SelectTrigger className="h-8 w-28" id="tradelog-side" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Both</SelectItem>
                <SelectItem value="long">Long</SelectItem>
                <SelectItem value="short">Short</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs" htmlFor="tradelog-outcome">
              Outcome
            </Label>
            <Select
              onValueChange={(v) => { setOutcome(v as OutcomeFilter); setPage(0) }}
              value={outcome}
            >
              <SelectTrigger className="h-8 w-28" id="tradelog-outcome" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="wins">Wins</SelectItem>
                <SelectItem value="losses">Losses</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtersActive && (
            <Button
              onClick={() => { setQuery(''); setSide('all'); setOutcome('all'); setPage(0) }}
              size="sm"
              variant="ghost"
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      <CardContent className={cn('px-0', styles.scroller, isLog && styles.scrollerTall)}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Net P&amp;L</TableHead>
              {showActions && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  className="py-8 text-center text-muted-foreground"
                  colSpan={showActions ? 6 : 5}
                >
                  {filtersActive ? 'No trades match these filters.' : 'No trades yet.'}
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-muted-foreground tabular-nums">{t.date}</TableCell>
                <TableCell className="font-medium">{t.symbol}</TableCell>
                <TableCell>
                  <Badge className="uppercase" variant="outline">{t.side}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{t.qty}</TableCell>
                <TableCell
                  className="text-right font-semibold tabular-nums"
                  style={{ color: t.pnl >= 0 ? 'var(--good-deep)' : 'var(--critical-deep)' }}
                >
                  {signedMoney(t.pnl)}
                </TableCell>
                {showActions && (
                  <TableCell className="text-right whitespace-nowrap">
                    {onEdit && (
                      <Button onClick={() => onEdit(t)} size="xs" variant="ghost">Edit</Button>
                    )}
                    {onDelete && (
                      <Button
                        // Destructive variant rather than a plain button with a
                        // red class: the row's Delete and the header's "Delete
                        // all" now read as the same kind of action.
                        onClick={() => onDelete(t.id!)}
                        size="xs"
                        variant="destructive"
                      >
                        Delete
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {isLog && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          <span className="text-muted-foreground text-xs tabular-nums">
            {safePage * PAGE_SIZE + 1}–{safePage * PAGE_SIZE + rows.length} of {filtered.length}
            {filtersActive && ` matching (${sorted.length} total)`}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <Button disabled={safePage === 0} onClick={() => setPage(0)} size="xs" variant="outline">
                First
              </Button>
              <Button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} size="xs" variant="outline">
                Previous
              </Button>
              <span className="px-2 text-muted-foreground text-xs tabular-nums">
                Page {safePage + 1} of {pageCount}
              </span>
              <Button
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
                size="xs"
                variant="outline"
              >
                Next
              </Button>
              <Button
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(pageCount - 1)}
                size="xs"
                variant="outline"
              >
                Last
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
