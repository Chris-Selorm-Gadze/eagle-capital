import type { Account } from '../../db/schema'
import styles from './TopBar.module.css'

export function TopBar({
  accounts,
  accountFilter,
  onAccountFilterChange,
  onAddTrade,
  onAddAccount,
  onSnapshot,
}: {
  accounts: Account[]
  accountFilter: string | 'all'
  onAccountFilterChange: (value: string | 'all') => void
  onAddTrade: () => void
  onAddAccount: () => void
  onSnapshot?: () => void
}) {
  return (
    <div className={styles.root}>
      <div className={styles.left}>
        <button onClick={onAddTrade} className="btn-primary">+ Add Trade</button>
        <button onClick={onAddAccount} className="btn-primary">+ Add Account</button>
        {onSnapshot && <button onClick={onSnapshot}>📷 Snapshot</button>}
        <select
          value={accountFilter}
          onChange={(e) => onAccountFilterChange(e.target.value === 'all' ? 'all' : e.target.value)}
        >
          <option value="all">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
