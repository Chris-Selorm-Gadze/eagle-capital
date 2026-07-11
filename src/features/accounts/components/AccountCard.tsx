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
  const accent = STAGE_ACCENT[account.stage]
  const netPnl = account.balance - account.size

  // Plain display of whatever the user typed in — no derived room/gate/pass-fail logic.
  const miniStats: { label: string; value: string }[] = []
  if (account.profitTarget !== undefined) miniStats.push({ label: 'Profit target', value: money(account.profitTarget) })
  if (account.maxDrawdown !== undefined) miniStats.push({ label: 'Max drawdown', value: money(account.maxDrawdown) })
  if (account.dailyLossLimit !== undefined) miniStats.push({ label: 'Daily loss limit', value: money(account.dailyLossLimit) })
  if (account.minTradingDays !== undefined) miniStats.push({ label: 'Min trading days', value: String(account.minTradingDays) })

  const hasMeta = account.fundedDate || account.cost !== undefined || account.cumulativePaid !== undefined

  return (
    <div className={styles.root} style={{ borderLeftColor: accent }}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{account.label}</div>
          <div className={styles.firmLine}>{firmName} · {money(account.size)}</div>
        </div>
        <span className={styles.stageBadge} style={{ color: accent, borderColor: accent }}>{STAGE_LABEL[account.stage]}</span>
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
          {account.cost !== undefined && <span>Cost {money(account.cost)}</span>}
          {account.cumulativePaid !== undefined && <span>Paid out {money(account.cumulativePaid)}</span>}
        </div>
      )}

      <div className={styles.buttonsRow}>
        <button onClick={onLogSession} className="btn-primary">Log session</button>
        <button onClick={onEdit} className="btn-ghost">Edit</button>
        {onPayoutPlanner && <button onClick={onPayoutPlanner}>Payout planner</button>}
        {onScalingTracker && <button onClick={onScalingTracker}>Scaling rules</button>}
      </div>
    </div>
  )
}
