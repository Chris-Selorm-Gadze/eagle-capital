import { useRef } from 'react'
import type { Account, Trade } from '../../../types'
import { rovingIndex } from '../../../shared/ui/activate'
import { tradeOutcome } from '../../../utils/tradeStats'
import styles from './TradeJournalList.module.css'

const OUTCOME_CLASS: Record<ReturnType<typeof tradeOutcome>, string> = {
  win: styles.outcomeWin,
  loss: styles.outcomeLoss,
  breakeven: styles.outcomeBreakeven,
}

const OUTCOME_LABEL: Record<ReturnType<typeof tradeOutcome>, string> = {
  win: 'WIN',
  loss: 'LOSS',
  breakeven: 'BE',
}

// Purely presentational — matches the outcome badge color, not a computed risk signal.
const OUTCOME_ACCENT: Record<ReturnType<typeof tradeOutcome>, string> = {
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
    <div>
      <select
        className={styles.accountSelect}
        value={accountFilter}
        onChange={(e) => onAccountFilterChange(e.target.value === 'all' ? 'all' : e.target.value)}
      >
        <option value="all">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.label}</option>
        ))}
      </select>
      <div
        className={styles.list}
        ref={listRef}
        role="listbox"
        aria-label="Trades"
        tabIndex={0}
        aria-activedescendant={selectedId ? `trade-option-${selectedId}` : undefined}
        onKeyDown={handleKeyDown}
      >
      {trades.map((t) => {
        const outcome = tradeOutcome(t.pnl)
        return (
          /* Keyboard handling lives on the listbox, which owns the single tab
             stop and points here with aria-activedescendant — so these rows
             carry no key handler of their own by design. */
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <div
            key={t.id}
            id={`trade-option-${t.id}`}
            className={`${styles.row} ${t.id === selectedId ? styles.rowActive : ''}`}
            style={{ borderLeftColor: OUTCOME_ACCENT[outcome] }}
            role="option"
            aria-selected={t.id === selectedId}
            tabIndex={-1}
            onClick={() => onSelect(t.id!)}
          >
            <div className={styles.rowTop}>
              <span className={styles.symbol}>{t.symbol}</span>
              <span className={`${styles.outcome} ${OUTCOME_CLASS[outcome]}`}>{OUTCOME_LABEL[outcome]}</span>
            </div>
            <div className={styles.rowBottom}>
              <span className={styles.rowMeta}>
                {t.date}
                <span className={`${styles.sideBadge} ${t.side === 'long' ? styles.sideLong : styles.sideShort}`}>{t.side}</span>
              </span>
              <span className={styles.pnl} style={{ color: t.pnl >= 0 ? 'var(--good)' : 'var(--critical)' }}>
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
