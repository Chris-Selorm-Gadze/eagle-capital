import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFileLines, faClockRotateLeft, faListCheck } from '@fortawesome/free-solid-svg-icons'
import type { ReportCard, Trade } from '../../types'
import { ReportCardPage } from '../reportcard/ReportCardPage'
import { CompletedReportCardsPage } from '../reportcard/CompletedReportCardsPage'
import { RulesPage } from './RulesPage'
import styles from './TraderManagementPage.module.css'

type SubTab = 'reportcard' | 'completed' | 'rules'

const SUB_TABS: { key: SubTab; label: string; icon: typeof faFileLines }[] = [
  { key: 'reportcard', label: 'Daily Report Card', icon: faFileLines },
  { key: 'completed', label: 'Completed DRCs', icon: faClockRotateLeft },
  { key: 'rules', label: 'Rules', icon: faListCheck },
]

export function TraderManagementPage({ userId, trades }: { userId: string; trades: Trade[] }) {
  const [tab, setTab] = useState<SubTab>('reportcard')
  const [openedCard, setOpenedCard] = useState<ReportCard | null>(null)
  const [resetToken, setResetToken] = useState(0)

  function openReportCard(card: ReportCard) {
    setOpenedCard(card)
    setTab('reportcard')
  }

  function goToFreshReportCard() {
    setOpenedCard(null)
    setResetToken((t) => t + 1)
    setTab('reportcard')
  }

  function closeOpenedCard() {
    setOpenedCard(null)
    setResetToken((t) => t + 1)
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '1rem' }}>Trader Management</h1>

      <div className={styles.tabs}>
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => (t.key === 'reportcard' ? goToFreshReportCard() : setTab(t.key))}
          >
            <FontAwesomeIcon icon={t.icon} /> {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: tab === 'reportcard' ? 'block' : 'none' }}>
        <ReportCardPage
          key={openedCard ? `opened-${openedCard.id}` : `blank-${resetToken}`}
          userId={userId}
          trades={trades}
          openedCard={openedCard}
          onClose={closeOpenedCard}
          onSaved={closeOpenedCard}
        />
      </div>
      {tab === 'completed' && <CompletedReportCardsPage trades={trades} onOpen={openReportCard} />}
      {tab === 'rules' && <RulesPage userId={userId} />}
    </div>
  )
}
