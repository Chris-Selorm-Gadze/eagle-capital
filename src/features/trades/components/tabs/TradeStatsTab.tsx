import { useState } from 'react'
import type { Trade } from '../../../../types'
import { tradeRiskDollars, initialTargetDollars, plannedRMultiple, realizedRMultiple } from '../../../../utils/tradeRisk'
import styles from '../TradeDetailPanel.module.css'

type TimeZoneMode = 'local' | 'ny'

// 'local' relies on toLocaleTimeString()'s default behavior, which already renders in the
// browser's own timezone — 'ny' pins it to America/New_York regardless of where the trader is,
// since that's the standard reference clock for US market sessions.
function formatTime(iso: string, zone: TimeZoneMode): string {
  if (zone === 'ny') {
    return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' })
  }
  return new Date(iso).toLocaleTimeString()
}

function fmtR(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(2)}R`
}

function fmtMoney(v: number | null): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString()}`
}

// Plain toLocaleString() defaults to maximumFractionDigits: 3, which silently rounds
// higher-precision instrument prices (5-decimal forex, 8-decimal crypto) — imported CSV
// values would visibly drift from what the broker actually reported. Preserve full precision
// here while still getting thousands separators for larger index/stock prices.
function fmtPrice(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

export function TradeStatsTab({ draft, onChange }: { draft: Trade; onChange: (patch: Partial<Trade>) => void }) {
  const [zone, setZone] = useState<TimeZoneMode>('local')
  const dir = draft.side === 'long' ? 1 : -1
  const grossPnl = (draft.exitPrice - draft.entryPrice) * draft.qty * dir
  const cost = draft.entryPrice * draft.qty
  const roiPct = cost !== 0 ? (draft.pnl / cost) * 100 : 0

  const risk = tradeRiskDollars({ entryPrice: draft.entryPrice, stopLoss: draft.stopLoss, qty: draft.qty, side: draft.side })
  const target = initialTargetDollars({ entryPrice: draft.entryPrice, profitTarget: draft.profitTarget, qty: draft.qty, side: draft.side })
  const plannedR = plannedRMultiple({ entryPrice: draft.entryPrice, stopLoss: draft.stopLoss, profitTarget: draft.profitTarget, side: draft.side })
  const realizedR = realizedRMultiple({ entryPrice: draft.entryPrice, stopLoss: draft.stopLoss, exitPrice: draft.exitPrice, side: draft.side })

  return (
    <div className={styles.statsGrid}>
      <div className={styles.group}>
        <div className={styles.groupTitle}>Trade facts</div>
        <div className={styles.statRow}><span>Entry price</span><span>${fmtPrice(draft.entryPrice)}</span></div>
        <div className={styles.statRow}><span>Exit price</span><span>${fmtPrice(draft.exitPrice)}</span></div>
        <div className={styles.statRow}>
          <span>Times shown in</span>
          <span className={styles.zoneToggle}>
            <button type="button" className={`${styles.zoneBtn} ${zone === 'local' ? styles.zoneBtnActive : ''}`} onClick={() => setZone('local')}>Local</button>
            <button type="button" className={`${styles.zoneBtn} ${zone === 'ny' ? styles.zoneBtnActive : ''}`} onClick={() => setZone('ny')}>NY (EST)</button>
          </span>
        </div>
        <div className={styles.statRow}><span>Entry time</span><span>{formatTime(draft.entryTime, zone)}</span></div>
        <div className={styles.statRow}><span>Exit time</span><span>{formatTime(draft.exitTime, zone)}</span></div>
        <div className={styles.statRow}><span>Qty</span><span>{draft.qty}</span></div>
        <div className={styles.statRow}><span>Fees</span><span>${(draft.fees ?? 0).toLocaleString()}</span></div>
        <div className={styles.statRow}><span>Gross P&amp;L</span><span>{fmtMoney(grossPnl)}</span></div>
        <div className={styles.statRow}><span>Net ROI (approx.)</span><span>{roiPct.toFixed(2)}%</span></div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>Risk &amp; R-multiples</div>
        <label className="field" style={{ marginTop: 0 }}>
          Planned stop-loss
          <input
            type="number"
            value={draft.stopLoss ?? ''}
            onChange={(e) => onChange({ stopLoss: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Planned profit target
          <input
            type="number"
            value={draft.profitTarget ?? ''}
            onChange={(e) => onChange({ profitTarget: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </label>

        <div className={styles.statRow} style={{ marginTop: '0.6rem' }}><span>Trade risk</span><span>{fmtMoney(risk)}</span></div>
        <div className={styles.statRow}><span>Initial target</span><span>{fmtMoney(target)}</span></div>
        <div className={styles.statRow}><span>Planned R-multiple</span><span>{fmtR(plannedR)}</span></div>
        <div className={styles.statRow}><span>Realized R-multiple</span><span>{fmtR(realizedR)}</span></div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>Rating</div>
        <div className={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={styles.star} onClick={() => onChange({ rating: draft.rating === n ? undefined : n })}>
              {(draft.rating ?? 0) >= n ? '★' : '☆'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
