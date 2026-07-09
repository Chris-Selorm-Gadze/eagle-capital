import type { Account } from '../../../db/schema'
import { PROP_FIRMS } from '../propFirms'
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
}

export function AccountCard({
  account,
  onEdit,
  onLogSession,
  onPayoutPlanner,
  onScalingTracker,
}: {
  account: Account
  onEdit: () => void
  onLogSession: () => void
  onPayoutPlanner?: () => void
  onScalingTracker?: () => void
}) {
  const firm = PROP_FIRMS.find((f) => f.id === account.firmId)
  const firmName = account.firmId === 'other'
    ? (account.customFirmName || 'Custom Firm')
    : (firm?.name || account.firmId)

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{account.label}</div>
          <div className={styles.balance}>
            Balance ${account.balance.toLocaleString()}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.4rem', fontWeight: 'normal' }}>
              · {firmName}
            </span>
          </div>
        </div>
        <span className={styles.stageBadge}>{STAGE_LABEL[account.stage]}</span>
      </div>

      <div className={styles.buttonsRow}>
        <button onClick={onLogSession} className="btn-primary">Log session</button>
        <button onClick={onEdit} className="btn-ghost">Edit</button>
        {onPayoutPlanner && <button onClick={onPayoutPlanner}>Payout planner</button>}
        {onScalingTracker && <button onClick={onScalingTracker}>Scaling rules</button>}
      </div>
    </div>
  )
}
