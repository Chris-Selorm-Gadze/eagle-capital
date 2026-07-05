import type { Account } from '../../db/schema'
import { BackupControls } from '../BackupControls'

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
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={onAddTrade} style={{ background: 'var(--accent)', border: '1px solid var(--accent)' }}>
          + Add Trade
        </button>
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
