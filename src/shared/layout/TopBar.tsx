import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faCamera, faBuilding, faChevronDown, faTrash } from '@fortawesome/free-solid-svg-icons'
import type { Account } from '../../db/schema'
import { deleteAccount } from '../../db/accounts'
import { errorMessage } from '../../utils/errors'
import styles from './TopBar.module.css'

export function TopBar({
  accounts,
  accountFilter,
  onAccountFilterChange,
  onAddTrade,
  onAddAccount,
  onSnapshot,
  onAccountDeleted,
}: {
  accounts: Account[]
  accountFilter: string | 'all'
  onAccountFilterChange: (value: string | 'all') => void
  onAddTrade: () => void
  onAddAccount: () => void
  onSnapshot?: () => void
  onAccountDeleted: () => void
}) {
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!filterOpen) return
    function onPointerDown(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [filterOpen])

  async function handleDeleteAccount(a: Account, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm(`Delete ${a.label}? This also deletes all sessions, trades, payouts, and rewards logged against it. This cannot be undone.`)) return
    try {
      await deleteAccount(a.id!)
      if (accountFilter === a.id) onAccountFilterChange('all')
      onAccountDeleted()
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  const selectedLabel = accountFilter === 'all' ? 'All accounts' : (accounts.find((a) => a.id === accountFilter)?.label ?? 'All accounts')

  return (
    <div className={styles.root}>
      <div className={styles.actions}>
        <button onClick={onAddTrade} className={`btn-primary ${styles.actionBtn}`}>
          <FontAwesomeIcon icon={faPlus} /> Add Trade
        </button>
        <button onClick={onAddAccount} className={`btn-ghost ${styles.actionBtn}`}>
          <FontAwesomeIcon icon={faPlus} /> Add Account
        </button>
        {onSnapshot && (
          <button onClick={onSnapshot} className={`btn-ghost ${styles.actionBtn}`}>
            <FontAwesomeIcon icon={faCamera} /> Snapshot
          </button>
        )}
      </div>

      <div className={styles.accountFilter} ref={filterRef}>
        <button className={styles.accountFilterToggle} onClick={() => setFilterOpen((o) => !o)}>
          <FontAwesomeIcon icon={faBuilding} className={styles.filterIcon} />
          <span>{selectedLabel}</span>
          <FontAwesomeIcon icon={faChevronDown} className={styles.filterChevron} />
        </button>
        {filterOpen && (
          <div className={styles.accountFilterMenu}>
            <button
              className={styles.accountFilterItem}
              onClick={() => { onAccountFilterChange('all'); setFilterOpen(false) }}
            >
              All accounts
            </button>
            {accounts.map((a) => (
              <div key={a.id} className={styles.accountFilterRow}>
                <button
                  className={styles.accountFilterItem}
                  onClick={() => { onAccountFilterChange(a.id!); setFilterOpen(false) }}
                >
                  {a.label}
                </button>
                <button
                  className={styles.accountFilterDelete}
                  onClick={(e) => handleDeleteAccount(a, e)}
                  aria-label={`Delete ${a.label}`}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
