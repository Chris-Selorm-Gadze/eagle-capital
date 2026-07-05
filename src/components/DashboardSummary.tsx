import type { Account } from '../db/schema'
import type { BreakerLevel } from '../domain/risk'
import { computeAccountRisk } from '../lib/accountRisk'

const STATUS = {
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
}

const BREAKER_STATUS: Record<Exclude<BreakerLevel, 'ok'>, { color: string; icon: string; label: string }> = {
  'break-30min': { color: STATUS.warning, icon: '⏱', label: '30-min break' },
  'done-for-day': { color: STATUS.serious, icon: '⛔', label: 'Done for the day' },
  'flat-for-week': { color: STATUS.critical, icon: '🛑', label: 'Flat for the week' },
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: '0.9rem 1.1rem', minWidth: 170 }}>
      <div style={{ fontSize: '0.75rem', color: '#666' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '0.15rem' }}>{value}</div>
    </div>
  )
}

export function DashboardSummary({
  accounts,
  breakerLevels,
}: {
  accounts: Account[]
  breakerLevels: Map<number, BreakerLevel>
}) {
  const fnFunded = accounts
    .filter((a) => a.firm === 'fundednext' && a.stage === 'funded')
    .reduce((sum, a) => sum + a.balance, 0)
  const apexBalance = accounts.filter((a) => a.firm === 'apex').reduce((sum, a) => sum + a.balance, 0)
  const totalCapital = accounts.reduce((sum, a) => sum + a.balance, 0)

  const redZone = accounts.filter((a) => {
    const { room, maxDd } = computeAccountRisk(a)
    return maxDd > 0 && room / maxDd < 0.3
  })

  const alerts = accounts
    .map((a) => ({ account: a, level: breakerLevels.get(a.id!) ?? ('ok' as BreakerLevel) }))
    .filter((x): x is { account: Account; level: Exclude<BreakerLevel, 'ok'> } => x.level !== 'ok')

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div style={{ fontSize: '0.85rem', color: '#666' }}>Total capital under management</div>
      <div style={{ fontSize: '2.5rem', fontWeight: 600, marginBottom: '1rem' }}>
        ${totalCapital.toLocaleString()}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: alerts.length ? '1rem' : 0 }}>
        <StatTile label="FundedNext funded capital" value={`$${fnFunded.toLocaleString()}`} />
        <StatTile label="Apex balance" value={`$${apexBalance.toLocaleString()}`} />
        <StatTile label="Accounts in red zone" value={String(redZone.length)} />
        <StatTile label="Active alerts" value={String(alerts.length)} />
      </div>

      {alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {alerts.map(({ account, level }) => {
            const s = BREAKER_STATUS[level]
            return (
              <div
                key={account.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 0.75rem', borderRadius: 6, background: '#fff',
                  border: `1px solid ${s.color}`, color: s.color, fontSize: '0.85rem', fontWeight: 600,
                }}
              >
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
