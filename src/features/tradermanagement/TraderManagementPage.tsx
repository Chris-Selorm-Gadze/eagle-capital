import { useState } from 'react'
import { ReportCardPage } from '../reportcard/ReportCardPage'
import { RulesPage } from './RulesPage'
import styles from './TraderManagementPage.module.css'

type SubTab = 'reportcard' | 'rules'

export function TraderManagementPage({ userId }: { userId: string }) {
  const [tab, setTab] = useState<SubTab>('reportcard')

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '1rem' }}>Trader Management</h1>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'reportcard' ? styles.tabActive : ''}`} onClick={() => setTab('reportcard')}>
          Daily Report Card
        </button>
        <button className={`${styles.tab} ${tab === 'rules' ? styles.tabActive : ''}`} onClick={() => setTab('rules')}>
          Rules
        </button>
      </div>

      {tab === 'reportcard' && <ReportCardPage userId={userId} />}
      {tab === 'rules' && <RulesPage userId={userId} />}
    </div>
  )
}
