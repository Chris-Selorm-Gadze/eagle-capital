import type { Account } from '../../../db/schema'
import { computeAccountRisk } from '../../risk/accountRisk'
import type { BreakerLevel } from '../../risk/risk'
import { PROP_FIRMS } from '../propFirms'
import styles from './AccountCard.module.css'

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
  verification: 'Verification',
  funded: 'Funded',
  evaluation: 'Evaluation',
  pa: 'PA',
  planned: 'Planned',
  blown: 'Blown',
  inactive: 'Inactive',
}

const BREAKER_COPY: Record<Exclude<BreakerLevel, 'ok'>, { text: string; color: string }> = {
  'break-30min': { text: 'Take a 30-min break', color: 'var(--warning)' },
  'done-for-day': { text: 'Done for the day', color: 'var(--serious)' },
  'flat-for-week': { text: 'Flat for the week', color: 'var(--critical)' },
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.miniStat}>
      <div className={styles.miniStatLabel}>{label}</div>
      <div className={styles.miniStatValue}>{value}</div>
    </div>
  )
}

export function AccountCard({
  account,
  breaker,
  onEdit,
  onLogSession,
  onPayoutPlanner,
  onScalingTracker,
}: {
  account: Account
  breaker: BreakerLevel
  onEdit: () => void
  onLogSession: () => void
  onPayoutPlanner?: () => void
  onScalingTracker?: () => void
}) {
  const { maxDd, room, risk, stop, trades, cushion } = computeAccountRisk(account)
  const color = roomColor(room, maxDd)

  const firm = PROP_FIRMS.find((f) => f.id === account.firmId)
  const firmName = account.firmId === 'other' 
    ? (account.customFirmName || 'Custom Firm') 
    : (firm?.name || account.firmId)

  return (
    <div className={styles.root} style={{ borderLeftColor: color }}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{account.label}</div>
          <div className={styles.balance}>
            Balance ${account.balance.toLocaleString()}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.4rem', fontWeight: 'normal' }}>
              · {firmName}
            </span>
          </div>
        </div>
        <span className={styles.stageBadge}>{STAGE_LABEL[account.stage]}</span>
      </div>

      {breaker !== 'ok' && (
        <div
          data-testid={`breaker-${breaker}`}
          className={styles.breakerBanner}
          style={{ color: BREAKER_COPY[breaker].color, border: `1px solid ${BREAKER_COPY[breaker].color}` }}
        >
          {BREAKER_COPY[breaker].text}
        </div>
      )}

      <div className={styles.roomBox} style={{ background: roomTint(room, maxDd) }}>
        <div className={styles.roomLabel}>Room to {account.trailingDrawdown ? 'trail' : 'max loss'}</div>
        <div className={styles.roomValue} style={{ color }} data-testid="room-to-dd">
          ${room.toLocaleString()}
        </div>
        {cushion && (
          <div className={styles.cushion}>
            ${cushion.amount.toLocaleString()} {cushion.label}
          </div>
        )}
      </div>

      <div className={styles.miniStatsRow}>
        <MiniStat label="Risk/trade" value={`$${risk.toLocaleString()}`} />
        <MiniStat label="Daily stop" value={`$${stop.toLocaleString()}`} />
        <MiniStat label="Max trades" value={String(trades)} />
      </div>

      <div className={styles.buttonsRow}>
        <button onClick={onLogSession} className="btn-primary">Log session</button>
        <button onClick={onEdit} className="btn-ghost">Edit</button>
        {onPayoutPlanner && <button onClick={onPayoutPlanner}>Payout planner</button>}
        {onScalingTracker && <button onClick={onScalingTracker}>Scaling rules</button>}
      </div>
    </div>
  )
}
