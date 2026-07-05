import type { Account } from '../db/schema'
import { computeAccountRisk } from '../lib/accountRisk'
import type { BreakerLevel } from '../domain/risk'

function roomPct(room: number, maxDd: number): number {
  return maxDd <= 0 ? 0 : room / maxDd
}

function roomColor(room: number, maxDd: number): string {
  const pct = roomPct(room, maxDd)
  if (pct > 0.5) return 'var(--good)'
  if (pct >= 0.3) return 'var(--warning)'
  return 'var(--critical)'
}

function roomTint(room: number, maxDd: number): string {
  const pct = roomPct(room, maxDd)
  if (pct > 0.5) return 'rgba(12,163,12,0.12)'
  if (pct >= 0.3) return 'rgba(250,178,25,0.12)'
  return 'rgba(208,59,59,0.12)'
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>{value}</div>
    </div>
  )
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
  const color = roomColor(room, maxDd)

  return (
    <div style={{
      border: '1px solid var(--border)', borderLeft: `3px solid ${color}`, borderRadius: 8,
      padding: '1rem', background: 'var(--surface)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700 }}>{account.label}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Balance ${account.balance.toLocaleString()}
          </div>
        </div>
        <span
          style={{
            fontSize: '0.72rem', padding: '2px 9px', borderRadius: 999, flexShrink: 0,
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
            marginTop: '0.75rem', padding: '0.4rem 0.6rem', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600,
            background: 'var(--surface-2)', color: BREAKER_COPY[breaker].color,
            border: `1px solid ${BREAKER_COPY[breaker].color}`,
          }}
        >
          {BREAKER_COPY[breaker].text}
        </div>
      )}

      <div style={{ marginTop: '0.85rem', padding: '0.7rem 0.85rem', borderRadius: 6, background: roomTint(room, maxDd) }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Room to {isApex ? 'trail' : 'max loss'}</div>
        <div style={{ fontSize: '1.65rem', fontWeight: 700, color }} data-testid="room-to-dd">
          ${room.toLocaleString()}
        </div>
        {cushion && (
          <div style={{ marginTop: '0.3rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            ${cushion.amount.toLocaleString()} {cushion.label}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
        <MiniStat label="Risk/trade" value={`$${risk.toLocaleString()}`} />
        <MiniStat label="Daily stop" value={`$${stop.toLocaleString()}`} />
        <MiniStat label="Max trades" value={String(trades)} />
      </div>

      <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button onClick={onLogSession} style={{ background: 'var(--accent)', border: '1px solid var(--accent)' }}>
          Log session
        </button>
        <button onClick={onEdit} style={{ background: 'transparent' }}>Edit</button>
        {onPayoutPlanner && <button onClick={onPayoutPlanner}>Payout planner</button>}
        {onCycleTracker && <button onClick={onCycleTracker}>Pro cycles</button>}
      </div>
    </div>
  )
}
