import type { Account, SessionLog } from '../../db/schema'
import { ScenarioChart } from './components/ScenarioChart'
import { EquityCurveChart } from './components/EquityCurveChart'
import styles from './PlanPage.module.css'

export function PlanPage({
  accounts,
  sessionsByAccountId,
}: {
  accounts: Account[]
  sessionsByAccountId: Map<number, SessionLog[]>
}) {
  const actualFundedCapital = accounts
    .filter((a) => a.firm === 'fundednext' && a.stage === 'funded')
    .reduce((sum, a) => sum + a.balance, 0)

  return (
    <div>
      <section className={styles.section}>
        <h2>Progress vs plan</h2>
        <ScenarioChart
          actualFundedCapital={actualFundedCapital}
          currentMonth={new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        />
        <div className={styles.equityGrid}>
          {accounts.map((a) => (
            <EquityCurveChart key={a.id} account={a} sessions={sessionsByAccountId.get(a.id!) ?? []} />
          ))}
        </div>
      </section>
    </div>
  )
}
