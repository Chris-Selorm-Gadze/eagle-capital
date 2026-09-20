import { useEffect, useState } from 'react'
import type { Account, Playbook, PlaybookExample, Trade } from '../../types'
import { listPlaybooks } from '../../db/playbooks'
import { listPlaybookExamples } from '../../db/playbookExamples'
import { TradeJournalList } from './components/TradeJournalList'
import { TradeDetailPanel } from './components/TradeDetailPanel'
import { TradeChartPanel } from './components/TradeChartPanel'
import { EmptyState, PageHeader } from '@/shared/ui/page'
import { Button } from '@/components/ui/button'
import { NotebookPenIcon, XIcon } from 'lucide-react'
import styles from './TradeJournalPage.module.css'

/** An active filter, and the way off it. The clear control is inside the chip
 * rather than beside it, so it can never be mistaken for a page action. */
function FilterChip({
  children,
  onClear,
}: {
  children: React.ReactNode
  onClear: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 py-0.5 pr-0.5 pl-2.5 text-xs">
      <span className="text-muted-foreground">Showing</span>
      <span className="font-medium">{children}</span>
      <Button
        aria-label="Clear this filter"
        className="size-5 rounded-full"
        onClick={onClear}
        size="icon-xs"
        variant="ghost"
      >
        <XIcon />
      </Button>
    </span>
  )
}

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
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          /* Each active filter is a dismissible chip rather than a sentence with
             a link in it. Two filters can be on at once, and as prose that read
             as two paragraphs of explanation above the data. */
          <div className="flex flex-wrap items-center gap-2">
            {dateFilter && (
              <FilterChip onClear={() => setDateFilter(undefined)}>
                {dateFilter}
              </FilterChip>
            )}
            {accountFilter !== 'all' && (
              <FilterChip onClear={() => setAccountFilter('all')}>
                {accounts.find((a) => a.id === accountFilter)?.label ?? 'This account'}
              </FilterChip>
            )}
          </div>
        }
        description={
          ordered.length > 0
            ? `${ordered.length} trade${ordered.length === 1 ? '' : 's'} in view. Pick one to read and annotate it.`
            : 'Pick a trade to read and annotate it.'
        }
        title="Trade Journal"
      />

      {!hasAnyTrades ? (
        <EmptyState
          description="Log a few in the Trade Log and they'll appear here ready to annotate."
          icon={<NotebookPenIcon />}
          title="Nothing to journal yet"
        />
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
              <p className="px-1 py-6 text-muted-foreground text-sm">
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
