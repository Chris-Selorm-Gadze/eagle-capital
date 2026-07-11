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

  const otherCapital = Math.max(0, totalCapital - fundedCapital - challengeCapital)

  const pct = (n: number) => (totalCapital > 0 ? Math.round((n / totalCapital) * 100) : 0)

  return (
    <section className={`card ${styles.section}`}>
      <div className={styles.heroRow}>
        <div>
          <div className={styles.heroLabel}>Total capital under management</div>
          <div className={styles.heroValue}>${totalCapital.toLocaleString()}</div>
        </div>
        <div className={styles.heroMeta}>{accounts.length} active account{accounts.length === 1 ? '' : 's'}</div>
      </div>

      {totalCapital > 0 && (
        <div className={styles.allocationBar}>
          {fundedCapital > 0 && <div className={styles.allocFunded} style={{ flex: fundedCapital }} />}
          {challengeCapital > 0 && <div className={styles.allocChallenge} style={{ flex: challengeCapital }} />}
          {otherCapital > 0 && <div className={styles.allocOther} style={{ flex: otherCapital }} />}
        </div>
      )}

      <div className={styles.statsRow}>
        <StatTile
          label="Total funded capital"
          value={`$${fundedCapital.toLocaleString()}`}
          badge={totalCapital > 0 ? `${pct(fundedCapital)}%` : undefined}
          color="var(--good)"
        />
        <StatTile
          label="Challenge size"
          value={`$${challengeCapital.toLocaleString()}`}
          badge={totalCapital > 0 ? `${pct(challengeCapital)}%` : undefined}
          color="var(--accent)"
        />
        {otherCapital > 0 && (
          <StatTile
            label="Other / planned"
            value={`$${otherCapital.toLocaleString()}`}
            badge={`${pct(otherCapital)}%`}
            color="var(--text-muted)"
          />
        )}
      </div>
    </section>
  )
}
