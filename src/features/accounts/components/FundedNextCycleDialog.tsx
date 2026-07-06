import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account } from '../../../db/schema'
import { addReward } from '../../../db/rewards'
import { todayISO } from '../../../db/sessions'
import { FN, proEligible, scaledSize } from '../../../domain/fundednext'
import { Modal } from '../../../shared/ui/Modal'

export function FundedNextCycleDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [growthPct, setGrowthPct] = useState('')
  const [fundedDate, setFundedDate] = useState(account.fundedDate ?? '')

  const rewards = useLiveQuery(() => db.rewards.where('accountId').equals(account.id!).sortBy('date'), [account.id]) ?? []
  const qualifyingCycles = rewards.filter((r) => r.growthPct >= FN.proMinCycleGrowth).length

  const now = new Date()
  const fundedDateObj = fundedDate ? new Date(fundedDate) : null
  const ageDays = fundedDateObj ? Math.floor((now.getTime() - fundedDateObj.getTime()) / 86_400_000) : null
  const daysUntilAgeOk = ageDays === null ? null : Math.max(0, FN.proMinAgeDays - ageDays)
  const eligible = fundedDateObj ? proEligible(fundedDateObj, qualifyingCycles, now) : false
  const nextSize = scaledSize(account.size, (account.scaleEvents ?? 0) + 1)

  async function saveFundedDate() {
    await db.accounts.update(account.id!, { fundedDate })
  }

  async function saveReward() {
    await addReward(account.id!, todayISO(), Number(growthPct) / 100)
    setGrowthPct('')
  }

  return (
    <Modal
      title={`FundedNext Pro tracker — ${account.label}`}
      onClose={onClose}
      minWidth={380}
      footer={
        <>
          <button onClick={onClose}>Close</button>
          <button onClick={saveReward} disabled={!growthPct}>Log reward</button>
        </>
      }
    >
      <label className="field">
        Funded date
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
          <input type="date" value={fundedDate} onChange={(e) => setFundedDate(e.target.value)} style={{ flex: 1 }} />
          <button onClick={saveFundedDate}>Set</button>
        </div>
      </label>

      <div style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
        <div>Qualifying cycles (≥{FN.proMinCycleGrowth * 100}%): {qualifyingCycles}/{FN.proCyclesRequired}</div>
        <div>Account age: {ageDays === null ? '— set funded date' : `${ageDays} days`}</div>
        <div>Days until 61-day mark: {daysUntilAgeOk === null ? '—' : daysUntilAgeOk}</div>
        <div style={{ fontWeight: 600, color: eligible ? 'var(--good)' : 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {eligible ? 'Pro eligible' : 'Not yet Pro eligible'}
        </div>
        <div style={{ marginTop: '0.5rem' }}>Next scaled size: ${nextSize.toLocaleString()}</div>
      </div>

      <label className="field" style={{ marginTop: '1rem' }}>
        Log performance reward — growth %
        <input type="number" step="0.1" value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} />
      </label>

      {rewards.length > 0 && (
        <ul style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '1.2rem' }}>
          {rewards.map((r) => (
            <li key={r.id}>{r.date}: {(r.growthPct * 100).toFixed(1)}% {r.growthPct >= FN.proMinCycleGrowth ? '✓' : ''}</li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
