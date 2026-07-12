import { useEffect, useState } from 'react'
import type { Account, Playbook, PlaybookExample, Trade } from '../../types'
import { listPlaybooks } from '../../db/playbooks'
import { listPlaybookExamples } from '../../db/playbookExamples'
import { TradeJournalList } from './components/TradeJournalList'
import { TradeDetailPanel } from './components/TradeDetailPanel'
import { TradeChartPanel } from './components/TradeChartPanel'
import styles from './TradeJournalPage.module.css'

export function TradeJournalPage({
  trades,
  accounts,
  userId,
  onChanged,
  initialDateFilter,
}: {
  trades: Trade[]
  accounts: Account[]
  userId: string
  onChanged: () => void
  initialDateFilter?: string
}) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [playbookExamples, setPlaybookExamples] = useState<PlaybookExample[]>([])
  const [dateFilter, setDateFilter] = useState<string | undefined>(initialDateFilter)
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  // Independent of the Dashboard's own account filter — this page can be scoped to a different
  // account (or all accounts) without changing what the Dashboard shows, and vice versa.
  const [accountFilter, setAccountFilter] = useState<string | 'all'>('all')

  const scopedTrades = accountFilter === 'all' ? trades : trades.filter((t) => t.accountId === accountFilter)
  const filtered = dateFilter ? scopedTrades.filter((t) => t.date === dateFilter) : scopedTrades
  const ordered = [...filtered].sort((a, b) => (a.date < b.date ? 1 : -1))
  // Distinct from `ordered.length === 0`: this only covers the true first-run "nothing logged
  // anywhere yet" case. An account/date filter narrowing the *current* view to zero must never
  // hide the list pane's dropdown — that dropdown is the only in-page way back to "All accounts",
  // so hiding it forced people to rely on the browser back button, which just pops the app's nav
  // history (e.g. back to Dashboard) instead of resetting this page's filter.
  const hasAnyTrades = trades.length > 0

  async function refreshPlaybooks() {
    const [p, e] = await Promise.all([listPlaybooks(), listPlaybookExamples()])
    setPlaybooks(p)
    setPlaybookExamples(e)
  }

  useEffect(() => {
    refreshPlaybooks()
  }, [])

  useEffect(() => {
    if (ordered.length === 0) return
    if (!selectedId || !ordered.some((t) => t.id === selectedId)) setSelectedId(ordered[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades.length, dateFilter, selectedId])

  const selected = ordered.find((t) => t.id === selectedId)

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className="page-title">Trade Journal</h1>
          {ordered.length > 0 && <span className={styles.count}>{ordered.length} trade{ordered.length === 1 ? '' : 's'}</span>}
        </div>
        {dateFilter && (
          <div className={styles.filterPill}>
            <span>Showing trades from {dateFilter}</span>
            <button type="button" className="btn-ghost" onClick={() => setDateFilter(undefined)}>Show all</button>
          </div>
        )}
        {accountFilter !== 'all' && (
          <div className={styles.filterPill}>
            <span>Showing trades for {accounts.find((a) => a.id === accountFilter)?.label ?? 'this account'}</span>
            <button type="button" className="btn-ghost" onClick={() => setAccountFilter('all')}>Show all accounts</button>
          </div>
        )}
      </div>

      {!hasAnyTrades ? (
        <p className={styles.empty}>No trades logged yet — log some in the Trade Log to start journaling.</p>
      ) : (
        <div className={styles.layout}>
          <div className={styles.listPane}>
            <TradeJournalList
              trades={ordered}
              accounts={accounts}
              accountFilter={accountFilter}
              onAccountFilterChange={setAccountFilter}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            {ordered.length === 0 && (
              <p className={styles.empty}>
                {dateFilter ? `No trades logged on ${dateFilter}.` : 'No trades logged for this account.'}
              </p>
            )}
          </div>
          {selected && (
            <>
              <div className={styles.detailPane}>
                <TradeDetailPanel
                  trade={selected}
                  orderedTrades={ordered}
                  onSelect={setSelectedId}
                  userId={userId}
                  onChanged={onChanged}
                  playbooks={playbooks}
                  playbookExamples={playbookExamples}
                  onPlaybooksChanged={refreshPlaybooks}
                />
              </div>
              <div className={styles.chartPane}>
                <TradeChartPanel trade={selected} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
