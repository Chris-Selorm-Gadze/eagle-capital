import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account } from '../db/schema'
import { recordPayout } from '../db/payouts'
import { todayISO } from '../db/sessions'
import { checkPayout, payoutProgress, PA_PAYOUT } from '../domain/apex'

function GateRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', padding: '0.25rem 0' }}>
      <span style={{ color: ok ? 'var(--good)' : 'var(--critical)' }}>{ok ? '✓' : '✗'}</span>
      <span>{label}</span>
    </div>
  )
}

export function PayoutPlannerDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [requested, setRequested] = useState('')

  const payouts = useLiveQuery(() => db.payouts.where('accountId').equals(account.id!).sortBy('date'), [account.id]) ?? []
  const sessions = useLiveQuery(() => db.sessions.where('accountId').equals(account.id!).sortBy('date'), [account.id]) ?? []

  const lastDate = payouts.at(-1)?.date
  const sessionsSince = sessions.filter((s) => !lastDate || s.date > lastDate)
  const progress = payoutProgress(sessionsSince)
  const payoutNumber = (account.payoutsDone ?? 0) + 1
  const result = checkPayout({ payoutNumber, balance: account.balance, ...progress })

  async function save() {
    await recordPayout(account, todayISO(), Number(requested))
    setRequested('')
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1.5rem', minWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Payout planner — {account.label}</h3>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Requesting payout #{payoutNumber}</div>

        <div style={{ marginTop: '0.75rem' }}>
          <GateRow ok={progress.tradingDaysSinceLast >= PA_PAYOUT.tradingDaysBetween}
            label={`${PA_PAYOUT.tradingDaysBetween} trading days: ${progress.tradingDaysSinceLast}/${PA_PAYOUT.tradingDaysBetween}`} />
          <GateRow ok={progress.profitableDays50 >= PA_PAYOUT.profitableDaysRequired}
            label={`${PA_PAYOUT.profitableDaysRequired}x $50+ days: ${progress.profitableDays50}/${PA_PAYOUT.profitableDaysRequired}`} />
          {payoutNumber <= PA_PAYOUT.safetyNetPayouts && (
            <GateRow ok={account.balance >= PA_PAYOUT.minBalance}
              label={
                account.balance >= PA_PAYOUT.minBalance
                  ? `Safety net: balance $${account.balance.toLocaleString()} clears $${PA_PAYOUT.minBalance.toLocaleString()}`
                  : `Safety net: need $${(PA_PAYOUT.minBalance - account.balance).toLocaleString()} more balance`
              } />
          )}
          {payoutNumber <= 5 && (
            <GateRow ok={progress.totalProfitSinceLastPayout >= result.minProfitNeededForWindfall}
              label={
                progress.totalProfitSinceLastPayout >= result.minProfitNeededForWindfall
                  ? `Windfall: $${progress.totalProfitSinceLastPayout.toLocaleString()} clears $${Math.ceil(result.minProfitNeededForWindfall).toLocaleString()} needed`
                  : `Windfall: need $${Math.ceil(result.minProfitNeededForWindfall - progress.totalProfitSinceLastPayout).toLocaleString()} more profit`
              } />
          )}
        </div>

        <div style={{ marginTop: '0.75rem', fontWeight: 600, color: result.ok ? 'var(--good)' : 'var(--critical)' }}>
          {result.ok ? `Ready — max requestable $${result.maxRequestable.toLocaleString()}` : 'Not yet eligible'}
        </div>

        <label style={{ display: 'block', marginTop: '1rem' }}>
          Record payout request
          <input type="number" value={requested} onChange={(e) => setRequested(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Close</button>
          <button onClick={save} disabled={!requested}>Save</button>
        </div>
      </div>
    </div>
  )
}
