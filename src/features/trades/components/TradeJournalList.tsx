import { useRef } from 'react'
import type { Account, Trade } from '../../../types'
import { rovingIndex } from '../../../shared/ui/activate'
import { tradeOutcome } from '../../../utils/tradeStats'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from 'cn'

/* Converted onto shadcn Select + Badge. The roving-focus listbox below is kept
 * as it was — it is the right pattern and nothing in shadcn replaces it. */

const OUTCOME_LABEL: Record<ReturnType<typeof tradeOutcome>, string> = {
  win: 'WIN',
  loss: 'LOSS',
  breakeven: 'BE',
}

/** The rail down the left edge of each row, and the outcome chip's colour.
 * Purely presentational — it matches the outcome, it is not a risk signal. */
const OUTCOME_TONE: Record<ReturnType<typeof tradeOutcome>, string> = {
  win: 'var(--good)',
  loss: 'var(--critical)',
  breakeven: 'var(--text-muted)',
}

export function TradeJournalList({
  trades,
  accounts,
  accountFilter,
  onAccountFilterChange,
  selectedId,
  onSelect,
}: {
  trades: Trade[]
  accounts: Account[]
  // Independent of the Dashboard's own account filter (top bar) — lets you look at, say, all
  // accounts on the Dashboard while journaling just one account's trades here, or vice versa.
  accountFilter: string | 'all'
  onAccountFilterChange: (value: string | 'all') => void
  selectedId: string | undefined
  onSelect: (id: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  /* Arrow keys move through the list, one tab stop for the whole thing.
   *
   * These rows had a click handler and nothing else, so the keyboard could not
   * reach a trade at all. Giving each row its own tab stop would have fixed
   * that and made it worse: a few hundred trades is a few hundred presses
   * between this list and anything after it. One stop, arrows inside, is both
   * what assistive tech expects and what anyone scanning a day's trades
   * actually wants.
   *
   * Selection follows focus, which is the right call here because selecting a
   * row only changes the detail pane beside it -- nothing is submitted, and
   * nothing is lost by passing through a row on the way to another. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const current = trades.findIndex((t) => t.id === selectedId)
    const next = rovingIndex(event.key, current < 0 ? 0 : current, trades.length)
    if (next === null) return
    event.preventDefault()
    const trade = trades[next]
    if (!trade?.id) return
    onSelect(trade.id)
    // Keep the newly selected row in view when the list is longer than its box.
    const rows = listRef.current?.querySelectorAll('[role="option"]')
    rows?.[next]?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="flex flex-col gap-2">
      <Select
        onValueChange={(v) => onAccountFilterChange(v === 'all' ? 'all' : v)}
        value={accountFilter}
      >
        <SelectTrigger aria-label="Filter by account" className="w-full">
          <SelectValue placeholder="All accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id!}>{a.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div
        aria-activedescendant={selectedId ? `trade-option-${selectedId}` : undefined}
        aria-label="Trades"
        className={cn(
          'flex flex-col gap-1 rounded-lg outline-none',
          'focus-visible:ring-3 focus-visible:ring-ring/50',
        )}
        onKeyDown={handleKeyDown}
        ref={listRef}
        role="listbox"
        tabIndex={0}
      >
        {trades.map((t) => {
          const outcome = tradeOutcome(t.pnl)
          const active = t.id === selectedId
          return (
            /* Keyboard handling lives on the listbox, which owns the single tab
               stop and points here with aria-activedescendant — so these rows
               carry no key handler of their own by design. */
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              aria-selected={active}
              className={cn(
                'cursor-pointer rounded-md border border-l-2 px-2.5 py-2 transition-colors',
                active ? 'border-border bg-muted' : 'border-transparent hover:bg-muted/60',
              )}
              id={`trade-option-${t.id}`}
              key={t.id}
              onClick={() => onSelect(t.id!)}
              role="option"
              style={{ borderLeftColor: OUTCOME_TONE[outcome] }}
              tabIndex={-1}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-sm">{t.symbol}</span>
                <span
                  className="shrink-0 font-semibold text-[0.65rem] tracking-wide"
                  style={{ color: OUTCOME_TONE[outcome] }}
                >
                  {OUTCOME_LABEL[outcome]}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  {t.date}
                  <Badge className="px-1 py-0 text-[0.6rem] uppercase" variant="outline">
                    {t.side}
                  </Badge>
                </span>
                <span
                  className="font-semibold text-xs tabular-nums"
                  style={{ color: t.pnl >= 0 ? 'var(--good-deep)' : 'var(--critical-deep)' }}
                >
                  {t.pnl >= 0 ? '+' : '-'}${Math.abs(t.pnl).toLocaleString()}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
