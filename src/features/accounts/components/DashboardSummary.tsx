import type { Account } from '../../../db/schema'
import type { BreakerLevel } from '../../risk/risk'
import { computeAccountRisk } from '../../risk/accountRisk'
import { StatTile } from '../../../shared/ui/StatTile'
import styles from './DashboardSummary.module.css'

const BREAKER_STATUS: Record<Exclude<BreakerLevel, 'ok'>, { color: string; icon: string; label: string }> = {
  'break-30min': { color: 'var(--warning)', icon: '⏱', label: '30-min break' },
  'done-for-day': { color: 'var(--serious)', icon: '⛔', label: 'Done for the day' },
  'flat-for-week': { color: 'var(--critical)', icon: '🛑', label: 'Flat for the week' },
}

export function DashboardSummary({
  accounts,
  breakerLevels,
}: {
  accounts: Account[]
  breakerLevels: Map<number, BreakerLevel>
}) {
  const totalCapital = accounts.reduce((sum, a) => sum + a.balance, 0)
  
  const fundedCapital = accounts
    .filter((a) => a.stage === 'funded' || a.stage === 'pa')
    .reduce((sum, a) => sum + a.balance, 0)

  const challengeCapital = accounts
    .filter((a) => ['challenge', 'phase2', 'verification', 'evaluation'].includes(a.stage))
    .reduce((sum, a) => sum + a.size, 0)

  const redZone = accounts.filter((a) => {
    const { room, maxDd } = computeAccountRisk(a)
    return maxDd > 0 && room / maxDd < 0.3
  })

  const alerts = accounts
    .map((a) => ({ account: a, level: breakerLevels.get(a.id!) ?? ('ok' as BreakerLevel) }))
    .filter((x): x is { account: Account; level: Exclude<BreakerLevel, 'ok'> } => x.level !== 'ok')

  return (
    <section className={styles.section}>
      <div className={styles.heroLabel}>Total capital under management</div>
      <div className={styles.heroValue}>${totalCapital.toLocaleString()}</div>

      <div className={styles.statsRow} style={{ marginBottom: alerts.length ? '1rem' : 0 }}>
        <StatTile label="Total funded capital" value={`$${fundedCapital.toLocaleString()}`} />
        <StatTile label="Challenge size" value={`$${challengeCapital.toLocaleString()}`} />
        <StatTile label="Accounts at risk" value={String(redZone.length)} />
        <StatTile label="Active alerts" value={String(alerts.length)} />
      </div>

      {alerts.length > 0 && (
        <div className={styles.alertsList}>
          {alerts.map(({ account, level }) => {
            const s = BREAKER_STATUS[level]
            return (
              <div key={account.id} className={styles.alertItem} style={{ border: `1px solid ${s.color}`, color: s.color }}>
                <span aria-hidden="true">{s.icon}</span>
                <span>{account.label}: {s.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
