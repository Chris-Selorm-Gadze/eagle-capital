import type { Account } from '../db/schema'
import { computeAccountRisk } from '../lib/accountRisk'
import type { BreakerLevel } from '../domain/risk'

function roomColor(room: number, maxDd: number): string {
  const pct = maxDd <= 0 ? 0 : room / maxDd
  if (pct > 0.5) return '#0a7d2c'
  if (pct >= 0.3) return '#b8860b'
  return '#c00'
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

const BREAKER_COPY: Record<Exclude<BreakerLevel, 'ok'>, { text: string; bg: string; fg: string }> = {
  'break-30min': { text: 'Take a 30-min break', bg: '#fff4d6', fg: '#8a6300' },
  'done-for-day': { text: 'Done for the day', bg: '#ffe1e1', fg: '#a10000' },
  'flat-for-week': { text: 'Flat for the week', bg: '#3a0000', fg: '#fff' },
}

export function AccountCard({
  account,
  breaker,
  onEdit,
  onLogSession,
}: {
  account: Account
  breaker: BreakerLevel
  onEdit: () => void
  onLogSession: () => void
}) {
  const { isApex, maxDd, room, risk, stop, trades, cushion } = computeAccountRisk(account)

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem', minWidth: 260 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{account.label}</strong>
        <span
          style={{
            fontSize: '0.75rem', padding: '2px 8px', borderRadius: 999,
            background: '#eee', color: '#333',
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
            background: BREAKER_COPY[breaker].bg, color: BREAKER_COPY[breaker].fg,
          }}
        >
          {BREAKER_COPY[breaker].text}
        </div>
      )}

      <div style={{ marginTop: '0.5rem', color: '#666' }}>
        Balance: ${account.balance.toLocaleString()}
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', color: '#666' }}>Room to {isApex ? 'trail' : 'max loss'}</div>
        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: roomColor(room, maxDd) }} data-testid="room-to-dd">
          ${room.toLocaleString()}
        </div>
      </div>

      {cushion && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
          ${cushion.amount.toLocaleString()} {cushion.label}
        </div>
      )}

      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', display: 'flex', gap: '1rem', color: '#333' }}>
        <span>Risk/trade: ${risk.toLocaleString()}</span>
        <span>Daily stop: ${stop.toLocaleString()}</span>
        <span>Max trades: {trades}</span>
      </div>

      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <button onClick={onEdit}>Edit</button>
        <button onClick={onLogSession}>Log session</button>
      </div>
    </div>
  )
}
