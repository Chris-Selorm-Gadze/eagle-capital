import type { Account } from '../db/schema'
import { computeAccountRisk } from '../lib/accountRisk'
import type { BreakerLevel } from '../domain/risk'

function roomColor(room: number, maxDd: number): string {
  const pct = maxDd <= 0 ? 0 : room / maxDd
  if (pct > 0.5) return 'var(--good)'
  if (pct >= 0.3) return 'var(--warning)'
  return 'var(--critical)'
}

const STAGE_LABEL: Record<Account['stage'], string> = {
  challenge: 'Challenge',
  phase2: 'Phase 2',
  funded: 'Funded',
  evaluation: 'Evaluation',
  pa: 'PA',
  planned: 'Planned',
  blown: 'Blown',
}

const BREAKER_COPY: Record<Exclude<BreakerLevel, 'ok'>, { text: string; color: string }> = {
  'break-30min': { text: 'Take a 30-min break', color: 'var(--warning)' },
  'done-for-day': { text: 'Done for the day', color: 'var(--serious)' },
  'flat-for-week': { text: 'Flat for the week', color: 'var(--critical)' },
}

export function AccountCard({
  account,
  breaker,
  onEdit,
  onLogSession,
  onPayoutPlanner,
  onCycleTracker,
}: {
  account: Account
  breaker: BreakerLevel
  onEdit: () => void
  onLogSession: () => void
  onPayoutPlanner?: () => void
  onCycleTracker?: () => void
}) {
  const { isApex, maxDd, room, risk, stop, trades, cushion } = computeAccountRisk(account)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', minWidth: 260, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{account.label}</strong>
        <span
          style={{
            fontSize: '0.75rem', padding: '2px 8px', borderRadius: 999,
            background: 'var(--surface-3)', color: 'var(--text-secondary)',
          }}
        >
          {STAGE_LABEL[account.stage]}
        </span>
      </div>

      {breaker !== 'ok' && (
        <div
          data-testid={`breaker-${breaker}`}
          style={{
            marginTop: '0.5rem', padding: '0.4rem 0.6rem', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600,
            background: 'var(--surface-2)', color: BREAKER_COPY[breaker].color,
            border: `1px solid ${BREAKER_COPY[breaker].color}`,
          }}
        >
          {BREAKER_COPY[breaker].text}
        </div>
      )}

      <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
        Balance: ${account.balance.toLocaleString()}
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Room to {isApex ? 'trail' : 'max loss'}</div>
        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: roomColor(room, maxDd) }} data-testid="room-to-dd">
          ${room.toLocaleString()}
        </div>
      </div>

      {cushion && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          ${cushion.amount.toLocaleString()} {cushion.label}
        </div>
      )}

      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', display: 'flex', gap: '1rem', color: 'var(--text-primary)' }}>
        <span>Risk/trade: ${risk.toLocaleString()}</span>
        <span>Daily stop: ${stop.toLocaleString()}</span>
        <span>Max trades: {trades}</span>
      </div>

      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button onClick={onEdit}>Edit</button>
        <button onClick={onLogSession}>Log session</button>
        {onPayoutPlanner && <button onClick={onPayoutPlanner}>Payout planner</button>}
        {onCycleTracker && <button onClick={onCycleTracker}>Pro cycles</button>}
      </div>
    </div>
  )
}
