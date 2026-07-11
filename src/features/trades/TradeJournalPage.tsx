import { useEffect, useState } from 'react'
import type { Playbook, PlaybookExample, Trade } from '../../types'
import { listPlaybooks } from '../../db/playbooks'
import { listPlaybookExamples } from '../../db/playbookExamples'
import { TradeJournalList } from './components/TradeJournalList'
import { TradeDetailPanel } from './components/TradeDetailPanel'
import styles from './TradeJournalPage.module.css'

export function TradeJournalPage({
  trades,
  userId,
  onChanged,
  initialDateFilter,
}: {
  trades: Trade[]
  userId: string
  onChanged: () => void
  initialDateFilter?: string
}) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [playbookExamples, setPlaybookExamples] = useState<PlaybookExample[]>([])
  const [dateFilter, setDateFilter] = useState<string | undefined>(initialDateFilter)
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)

  const filtered = dateFilter ? trades.filter((t) => t.date === dateFilter) : trades
  const ordered = [...filtered].sort((a, b) => (a.date < b.date ? 1 : -1))

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
          <div className={styles.dateFilterPill}>
            <span>Showing trades from {dateFilter}</span>
            <button type="button" className="btn-ghost" onClick={() => setDateFilter(undefined)}>Show all</button>
          </div>
        )}
      </div>

      {ordered.length === 0 ? (
        <p className={styles.empty}>
          {dateFilter
            ? `No trades logged on ${dateFilter}.`
            : 'No trades logged yet — log some in the Trade Log to start journaling.'}
        </p>
      ) : (
        <div className={styles.layout}>
          <TradeJournalList trades={ordered} selectedId={selectedId} onSelect={setSelectedId} />
          {selected && (
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
          )}
        </div>
      )}
    </div>
  )
}
