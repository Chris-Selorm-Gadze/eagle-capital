import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronLeft, faChevronRight, faChartLine, faBookOpen, faTag, faChartArea, faPenToSquare,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import type { Playbook, PlaybookExample, Trade } from '../../../types'
import { updateTrade } from '../../../db/trades'
import { tradeOutcome, tradeDurationMinutes } from '../../../utils/tradeStats'
import { formatDuration } from '../../../utils/format'
import { errorMessage } from '../../../utils/errors'
import { TradeStatsTab } from './tabs/TradeStatsTab'
import { TradeStrategyTab } from './tabs/TradeStrategyTab'
import { TradeTagsTab } from './tabs/TradeTagsTab'
import { TradeChartTab } from './tabs/TradeChartTab'
import { TradeNotesTab } from './tabs/TradeNotesTab'
import styles from './TradeDetailPanel.module.css'

type Tab = 'stats' | 'strategy' | 'tags' | 'chart' | 'notes'

const TABS: { key: Tab; label: string; icon: IconDefinition }[] = [
  { key: 'stats', label: 'Stats', icon: faChartLine },
  { key: 'strategy', label: 'Strategy', icon: faBookOpen },
  { key: 'tags', label: 'Tags', icon: faTag },
  { key: 'chart', label: 'Chart', icon: faChartArea },
  { key: 'notes', label: 'Notes', icon: faPenToSquare },
]

const OUTCOME_BADGE_CLASS: Record<ReturnType<typeof tradeOutcome>, string> = {
  win: styles.outcomeWin,
  loss: styles.outcomeLoss,
  breakeven: styles.outcomeBreakeven,
}

const OUTCOME_LABEL: Record<ReturnType<typeof tradeOutcome>, string> = {
  win: 'Win',
  loss: 'Loss',
  breakeven: 'Breakeven',
}

export function TradeDetailPanel({
  trade,
  orderedTrades,
  onSelect,
  userId,
  onChanged,
  playbooks,
  playbookExamples,
  onPlaybooksChanged,
}: {
  trade: Trade
  orderedTrades: Trade[]
  onSelect: (id: string) => void
  userId: string
  onChanged: () => void
  playbooks: Playbook[]
  playbookExamples: PlaybookExample[]
  onPlaybooksChanged: () => void
}) {
  const [tab, setTab] = useState<Tab>('stats')
  const [draft, setDraft] = useState<Trade>(trade)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    setDraft(trade)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.id])

  function patch(p: Partial<Trade>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  const index = orderedTrades.findIndex((t) => t.id === trade.id)
  const prevTrade = index > 0 ? orderedTrades[index - 1] : undefined
  const nextTrade = index >= 0 && index < orderedTrades.length - 1 ? orderedTrades[index + 1] : undefined

  const outcome = tradeOutcome(trade.pnl)
  const heldMinutes = tradeDurationMinutes(trade.entryTime, trade.exitTime)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateTrade(trade.id!, draft, draft.pnl)
      onChanged()
      setSavedMessage('Saved')
      setTimeout(() => setSavedMessage(''), 1600)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <button type="button" className={styles.navArrow} onClick={() => prevTrade && onSelect(prevTrade.id!)} disabled={!prevTrade}>
            <FontAwesomeIcon icon={faChevronLeft} fixedWidth />
          </button>
          <span className={styles.symbol}>{trade.symbol}</span>
          <span className={`${styles.sideBadge} ${trade.side === 'long' ? styles.sideLong : styles.sideShort}`}>{trade.side.toUpperCase()}</span>
          <span className={`${styles.outcomeBadge} ${OUTCOME_BADGE_CLASS[outcome]}`}>{OUTCOME_LABEL[outcome]}</span>
          <button type="button" className={styles.navArrow} onClick={() => nextTrade && onSelect(nextTrade.id!)} disabled={!nextTrade}>
            <FontAwesomeIcon icon={faChevronRight} fixedWidth />
          </button>
        </div>
        <div className={styles.headerMeta}>
          Opened {trade.entryTime.slice(0, 10)} · Closed {trade.exitTime.slice(0, 10)} · Held {formatDuration(heldMinutes)}
        </div>
      </div>

      <div className={styles.pnlBar}>
        <div className={styles.pnlLabel}>Net P&amp;L</div>
        <div className={styles.pnlValue} style={{ color: trade.pnl >= 0 ? 'var(--good)' : 'var(--critical)' }}>
          {trade.pnl >= 0 ? '+' : '-'}${Math.abs(trade.pnl).toLocaleString()}
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button type="button" key={t.key} className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`} onClick={() => setTab(t.key)}>
            <FontAwesomeIcon icon={t.icon} fixedWidth />
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.tabContent}>
        {tab === 'stats' && <TradeStatsTab draft={draft} onChange={patch} />}
        {tab === 'strategy' && (
          <TradeStrategyTab
            tradeId={trade.id!}
            userId={userId}
            playbooks={playbooks}
            playbookExamples={playbookExamples}
            onChanged={onPlaybooksChanged}
          />
        )}
        {tab === 'tags' && <TradeTagsTab draft={draft} onChange={patch} />}
        {tab === 'chart' && <TradeChartTab trade={trade} />}
        {tab === 'notes' && <TradeNotesTab draft={draft} onChange={patch} />}
      </div>

      <div className={styles.saveBar}>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        {savedMessage && <span style={{ color: 'var(--good)', fontSize: '0.8rem' }}>{savedMessage}</span>}
        {error && <span style={{ color: 'var(--critical)', fontSize: '0.8rem' }}>{error}</span>}
      </div>
    </div>
  )
}
