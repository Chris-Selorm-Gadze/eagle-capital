import { useEffect, useMemo, useState } from 'react'
import type { Trade } from '../../../db/schema'
import styles from './RecentTradesTable.module.css'

/* One table, two jobs.
 *
 * With `limit` it is the dashboard's "last eight trades" tile. Without it, it is
 * the entire Trade Log — and that version used to render every row it was given
 * in page flow. At a few hundred trades the page ran for tens of thousands of
 * pixels, the "Delete all" button and the account filter scrolled out of reach
 * above it, and finding one trade meant scrolling past all the others. So the
 * unbounded version pages, filters, and scrolls inside its own box; the limited
 * one is untouched. */

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
  const [query, setQuery] = useState('')
  const [side, setSide] = useState<SideFilter>('all')
  const [outcome, setOutcome] = useState<OutcomeFilter>('all')
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => [...trades].sort((a, b) => (a.date < b.date ? 1 : -1)), [trades])

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
    <div className="card">
      <div className={styles.title}>{title}</div>

      {isLog && sorted.length > 0 && (
        <div className={styles.filters}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Symbol</span>
            <input
              type="search"
              value={query}
              placeholder="e.g. NQ"
              onChange={(e) => { setQuery(e.target.value); setPage(0) }}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Side</span>
            <select value={side} onChange={(e) => { setSide(e.target.value as SideFilter); setPage(0) }}>
              <option value="all">Both</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Outcome</span>
            <select value={outcome} onChange={(e) => { setOutcome(e.target.value as OutcomeFilter); setPage(0) }}>
              <option value="all">All</option>
              <option value="wins">Wins</option>
              <option value="losses">Losses</option>
            </select>
          </label>
          {filtersActive && (
            <button
              type="button"
              className={`btn-ghost ${styles.clearFilters}`}
              onClick={() => { setQuery(''); setSide('all'); setOutcome('all'); setPage(0) }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className={`${styles.scroller} ${isLog ? styles.scrollerTall : ''}`}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.headerRow}>
              <th className={styles.cell}>Date</th>
              <th className={styles.cell}>Symbol</th>
              <th className={styles.cell}>Side</th>
              <th className={`${styles.cell} ${styles.numCell}`}>Qty</th>
              <th className={`${styles.cell} ${styles.numCell}`}>Net P&amp;L</th>
              {showActions && <th className={styles.cell} />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={showActions ? 6 : 5} className={styles.emptyRow}>
                  {filtersActive ? 'No trades match these filters.' : 'No trades yet.'}
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className={styles.row}>
                <td className={styles.cell}>{t.date}</td>
                <td className={`${styles.cell} ${styles.symbol}`}>{t.symbol}</td>
                <td className={styles.cell}>
                  <span className={`${styles.sideBadge} ${t.side === 'long' ? styles.sideLong : styles.sideShort}`}>{t.side}</span>
                </td>
                <td className={`${styles.cell} ${styles.numCell}`}>{t.qty}</td>
                <td className={`${styles.cell} ${styles.numCell} ${styles.pnl}`} style={{ color: t.pnl >= 0 ? 'var(--good)' : 'var(--critical)' }}>
                  {t.pnl >= 0 ? '+' : '-'}${Math.abs(t.pnl).toLocaleString()}
                </td>
                {showActions && (
                  <td className={`${styles.cell} ${styles.actionsCell}`}>
                    {onEdit && <button onClick={() => onEdit(t)}>Edit</button>}
                    {onDelete && <button onClick={() => onDelete(t.id!)} className={onEdit ? styles.deleteButton : undefined}>Delete</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isLog && filtered.length > 0 && (
        <div className={styles.pager}>
          <span className={styles.pagerCount}>
            {safePage * PAGE_SIZE + 1}–{safePage * PAGE_SIZE + rows.length} of {filtered.length}
            {filtersActive && ` matching (${sorted.length} total)`}
          </span>
          {pageCount > 1 && (
            <div className={styles.pagerControls}>
              <button type="button" onClick={() => setPage(0)} disabled={safePage === 0}>First</button>
              <button type="button" onClick={() => setPage(safePage - 1)} disabled={safePage === 0}>Previous</button>
              <span className={styles.pagerPosition}>Page {safePage + 1} of {pageCount}</span>
              <button type="button" onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1}>Next</button>
              <button type="button" onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1}>Last</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
