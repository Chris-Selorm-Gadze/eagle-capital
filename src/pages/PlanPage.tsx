import type { Account, SessionLog } from '../db/schema'
import { ScenarioChart } from '../components/ScenarioChart'
import { EquityCurveChart } from '../components/EquityCurveChart'

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
      <section style={{ marginBottom: '2rem' }}>
        <h2>Progress vs plan</h2>
        <ScenarioChart
          actualFundedCapital={actualFundedCapital}
          currentMonth={new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem' }}>
          {accounts.map((a) => (
            <EquityCurveChart key={a.id} account={a} sessions={sessionsByAccountId.get(a.id!) ?? []} />
          ))}
        </div>
      </section>
    </div>
  )
}
