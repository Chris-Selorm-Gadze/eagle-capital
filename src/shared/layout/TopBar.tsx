import type { Account } from '../../db/schema'
import { BackupControls } from '../../features/accounts/components/BackupControls'
import styles from './TopBar.module.css'

export function TopBar({
  accounts,
  accountFilter,
  onAccountFilterChange,
  onAddTrade,
}: {
  accounts: Account[]
  accountFilter: number | 'all'
  onAccountFilterChange: (value: number | 'all') => void
  onAddTrade: () => void
}) {
  return (
    <div className={styles.root}>
      <div className={styles.left}>
        <button onClick={onAddTrade} className="btn-primary">+ Add Trade</button>
        <select
          value={accountFilter}
          onChange={(e) => onAccountFilterChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </div>
      <BackupControls />
    </div>
  )
}
