import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account } from '../db/schema'
import { addReward } from '../db/rewards'
import { todayISO } from '../db/sessions'
import { FN, proEligible, scaledSize } from '../domain/fundednext'

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
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1.5rem', minWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>FundedNext Pro tracker — {account.label}</h3>

        <label style={{ display: 'block', marginTop: '0.75rem' }}>
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

        <label style={{ display: 'block', marginTop: '1rem' }}>
          Log performance reward — growth %
          <input type="number" step="0.1" value={growthPct} onChange={(e) => setGrowthPct(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        {rewards.length > 0 && (
          <ul style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '1.2rem' }}>
            {rewards.map((r) => (
              <li key={r.id}>{r.date}: {(r.growthPct * 100).toFixed(1)}% {r.growthPct >= FN.proMinCycleGrowth ? '✓' : ''}</li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Close</button>
          <button onClick={saveReward} disabled={!growthPct}>Log reward</button>
        </div>
      </div>
    </div>
  )
}
