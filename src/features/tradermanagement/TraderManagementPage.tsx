import { useState } from 'react'
import type { Trade } from '../../types'
import { ReportCardPage } from '../reportcard/ReportCardPage'
import { CompletedReportCardsPage } from '../reportcard/CompletedReportCardsPage'
import { RulesPage } from './RulesPage'
import { todayISO } from '../../db/sessions'
import styles from './TraderManagementPage.module.css'

type SubTab = 'reportcard' | 'completed' | 'rules'

export function TraderManagementPage({ userId, trades }: { userId: string; trades: Trade[] }) {
  const [tab, setTab] = useState<SubTab>('reportcard')
  const [reportDate, setReportDate] = useState(todayISO())

  function openReportCard(date: string) {
    setReportDate(date)
    setTab('reportcard')
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '1rem' }}>Trader Management</h1>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'reportcard' ? styles.tabActive : ''}`} onClick={() => setTab('reportcard')}>
          Daily Report Card
        </button>
        <button className={`${styles.tab} ${tab === 'completed' ? styles.tabActive : ''}`} onClick={() => setTab('completed')}>
          Completed DRCs
        </button>
        <button className={`${styles.tab} ${tab === 'rules' ? styles.tabActive : ''}`} onClick={() => setTab('rules')}>
          Rules
        </button>
      </div>

      {tab === 'reportcard' && (
        <ReportCardPage userId={userId} trades={trades} date={reportDate} onDateChange={setReportDate} />
      )}
      {tab === 'completed' && <CompletedReportCardsPage trades={trades} onOpen={openReportCard} />}
      {tab === 'rules' && <RulesPage userId={userId} />}
    </div>
  )
}
