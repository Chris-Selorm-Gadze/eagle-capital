import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account } from '../../../db/schema'
import { recordPayout } from '../../../db/payouts'
import { todayISO } from '../../../db/sessions'
import { checkPayout, payoutProgress, PA_PAYOUT } from '../../../domain/apex'
import { Modal } from '../../../shared/ui/Modal'
import styles from './PayoutPlannerDialog.module.css'

function GateRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={styles.gateRow}>
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
    <Modal
      title={`Payout planner — ${account.label}`}
      onClose={onClose}
      minWidth={380}
      footer={
        <>
          <button onClick={onClose}>Close</button>
          <button onClick={save} disabled={!requested}>Save</button>
        </>
      }
    >
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Requesting payout #{payoutNumber}</div>

      <div className={styles.gates}>
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

      <div className={styles.result} style={{ color: result.ok ? 'var(--good)' : 'var(--critical)' }}>
        {result.ok ? `Ready — max requestable $${result.maxRequestable.toLocaleString()}` : 'Not yet eligible'}
      </div>

      <label className="field" style={{ marginTop: '1rem' }}>
        Record payout request
        <input type="number" value={requested} onChange={(e) => setRequested(e.target.value)} />
      </label>
    </Modal>
  )
}
