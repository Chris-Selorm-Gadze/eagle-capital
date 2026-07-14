import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEllipsisVertical, faTrash } from '@fortawesome/free-solid-svg-icons'
import type { Account } from '../../../db/schema'
import { PROP_FIRMS } from '../propFirms'
import { deleteAccount } from '../../../db/accounts'
import { errorMessage } from '../../../utils/errors'
import styles from './AccountCard.module.css'

const STAGE_LABEL: Record<Account['stage'], string> = {
  challenge: 'Challenge',
  phase2: 'Phase 2',
  verification: 'Verification',
  funded: 'Funded',
  evaluation: 'Evaluation',
  pa: 'PA',
  planned: 'Planned',
  blown: 'Blown',
  inactive: 'Inactive',
  live: 'Live',
}

// Purely presentational grouping by stage — not a computed risk/eligibility signal.
const STAGE_ACCENT: Record<Account['stage'], string> = {
  funded: 'var(--good)',
  pa: 'var(--good)',
  challenge: 'var(--accent)',
  phase2: 'var(--accent)',
  verification: 'var(--accent)',
  evaluation: 'var(--accent)',
  planned: 'var(--text-muted)',
  blown: 'var(--critical)',
  inactive: 'var(--text-muted)',
  live: 'var(--accent)',
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

export function AccountCard({
  account,
  onEdit,
  onLogSession,
  onPayoutPlanner,
  onScalingTracker,
  onDeleted,
}: {
  account: Account
  onEdit: () => void
  onLogSession: () => void
  onPayoutPlanner?: () => void
  onScalingTracker?: () => void
  onDeleted: () => void
}) {
  const firm = PROP_FIRMS.find((f) => f.id === account.firmId)
  const firmName = account.stage === 'live'
    ? 'Live account'
    : account.firmId === 'other'
      ? (account.customFirmName || 'Custom Firm')
      : (firm?.name || account.firmId)
  const accent = STAGE_ACCENT[account.stage]
  const netPnl = account.balance - account.size

  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  async function handleDelete() {
    setMenuOpen(false)
    if (!window.confirm(`Delete ${account.label}? This also deletes all sessions, trades, payouts, and rewards logged against it. This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteAccount(account.id!)
      onDeleted()
    } catch (err) {
      alert(errorMessage(err))
      setDeleting(false)
    }
  }

  // Plain display of whatever the user typed in — no derived room/gate/pass-fail logic.
  const miniStats: { label: string; value: string }[] = []
  if (account.profitTarget !== undefined) miniStats.push({ label: 'Profit target', value: money(account.profitTarget) })
  if (account.maxDrawdown !== undefined) miniStats.push({ label: 'Max drawdown', value: money(account.maxDrawdown) })
  if (account.dailyLossLimit !== undefined) miniStats.push({ label: 'Daily loss limit', value: money(account.dailyLossLimit) })
  if (account.minTradingDays !== undefined) miniStats.push({ label: 'Min trading days', value: String(account.minTradingDays) })

  const hasMeta = Boolean(account.fundedDate)

  return (
    <div className={styles.root} style={{ borderLeftColor: accent }}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{account.label}</div>
          <div className={styles.firmLine}>{firmName} · {money(account.size)}</div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.stageBadge} style={{ color: accent, borderColor: accent }}>{STAGE_LABEL[account.stage]}</span>
          <div className={styles.menuWrapper} ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className={styles.menuButton}
              disabled={deleting}
              aria-label="Account actions"
            >
              <FontAwesomeIcon icon={faEllipsisVertical} />
            </button>
            {menuOpen && (
              <div className={styles.menu}>
                <button onClick={() => { setMenuOpen(false); onLogSession() }} className={styles.menuItem}>
                  Log session
                </button>
                <button onClick={() => { setMenuOpen(false); onEdit() }} className={styles.menuItem}>
                  Edit
                </button>
                {onPayoutPlanner && (
                  <button onClick={() => { setMenuOpen(false); onPayoutPlanner() }} className={styles.menuItem}>
                    Payout planner
                  </button>
                )}
                {onScalingTracker && (
                  <button onClick={() => { setMenuOpen(false); onScalingTracker() }} className={styles.menuItem}>
                    Scaling rules
                  </button>
                )}
                <div className={styles.menuDivider} />
                <button onClick={handleDelete} className={styles.menuItemDanger}>
                  <FontAwesomeIcon icon={faTrash} /> Delete account
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.balanceRow}>
        <div>
          <div className={styles.balanceLabel}>Balance</div>
          <div className={styles.balanceValue}>{money(account.balance)}</div>
        </div>
        <div className={styles.pnl} style={{ color: netPnl >= 0 ? 'var(--good)' : 'var(--critical)' }}>
          {netPnl >= 0 ? '+' : '-'}{money(Math.abs(netPnl))}
        </div>
      </div>

      {miniStats.length > 0 && (
        <div className={styles.miniStatsRow}>
          {miniStats.map((s) => (
            <div key={s.label} className={styles.miniStat}>
              <div className={styles.miniStatLabel}>{s.label}</div>
              <div className={styles.miniStatValue}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {hasMeta && (
        <div className={styles.metaRow}>
          {account.fundedDate && <span>Funded {account.fundedDate}</span>}
        </div>
      )}
    </div>
  )
}
