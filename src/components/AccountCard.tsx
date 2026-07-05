import type { Account } from '../db/schema'
import { roomToTrail, profitToTarget, profitToPayoutMin, APEX_250K } from '../domain/apex'
import { ddLimits, type FnModel } from '../domain/fundednext'
import { riskPerTrade, dailyStop, maxTradesPerDay } from '../domain/risk'

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

export function AccountCard({ account, onEdit }: { account: Account; onEdit: () => void }) {
  const isApex = account.firm === 'apex'
  const maxDd = isApex ? APEX_250K.trailingDD : ddLimits(account.model as FnModel, account.size).maxLoss
  const firmDailyLimit = isApex ? null : ddLimits(account.model as FnModel, account.size).dailyLoss
  const room = isApex
    ? roomToTrail(account.balance, account.highestBalance, account.stage === 'pa' ? 'pa' : 'evaluation', account.platform)
    : account.balance - (account.size - maxDd)
  const risk = riskPerTrade(maxDd)
  const stop = dailyStop(firmDailyLimit, maxDd)
  const trades = maxTradesPerDay(stop, risk)

  const cushion = isApex
    ? account.stage === 'pa'
      ? { label: 'to payout minimum', amount: profitToPayoutMin(account.balance) }
      : { label: 'to eval target', amount: profitToTarget(account.balance) }
    : null

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

      <button style={{ marginTop: '0.75rem' }} onClick={onEdit}>
        Edit
      </button>
    </div>
  )
}
