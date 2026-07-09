import type { Account } from '../../../db/schema'
import { StatTile } from '../../../shared/ui/StatTile'
import styles from './DashboardSummary.module.css'

export function DashboardSummary({ accounts }: { accounts: Account[] }) {
  const totalCapital = accounts.reduce((sum, a) => sum + a.balance, 0)

  const fundedCapital = accounts
    .filter((a) => a.stage === 'funded' || a.stage === 'pa')
    .reduce((sum, a) => sum + a.balance, 0)

  const challengeCapital = accounts
    .filter((a) => ['challenge', 'phase2', 'verification', 'evaluation'].includes(a.stage))
    .reduce((sum, a) => sum + a.size, 0)

  return (
    <section className={styles.section}>
      <div className={styles.heroLabel}>Total capital under management</div>
      <div className={styles.heroValue}>${totalCapital.toLocaleString()}</div>

      <div className={styles.statsRow}>
        <StatTile label="Total funded capital" value={`$${fundedCapital.toLocaleString()}`} />
        <StatTile label="Challenge size" value={`$${challengeCapital.toLocaleString()}`} />
      </div>
    </section>
  )
}
