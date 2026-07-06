import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account } from '../../../db/schema'
import { addReward } from '../../../db/rewards'
import { todayISO } from '../../../db/sessions'
import { scalingEligible, scaledSize, qualifyingCyclesCount } from '../../risk/scalingRules'
import { SCALING_RULE_PACKS } from '../rulePacks'
import { Modal } from '../../../shared/ui/Modal'
import type { ScalingRuleProfile } from '../../../types'

function formFromProfile(profile?: ScalingRuleProfile) {
  return {
    cyclesRequired: String(profile?.cyclesRequired ?? 4),
    minCycleGrowthPct: String((profile?.minCycleGrowthPct ?? 0.04) * 100),
    minAgeDays: String(profile?.minAgeDays ?? 61),
    scaleRatePct: String((profile?.scaleRatePct ?? 0.25) * 100),
    scaleCeiling: profile?.scaleCeiling !== undefined ? String(profile.scaleCeiling) : '',
  }
}

function formToProfile(f: ReturnType<typeof formFromProfile>): ScalingRuleProfile {
  return {
    cyclesRequired: Number(f.cyclesRequired),
    minCycleGrowthPct: Number(f.minCycleGrowthPct) / 100,
    minAgeDays: Number(f.minAgeDays),
    scaleRatePct: Number(f.scaleRatePct) / 100,
    scaleCeiling: f.scaleCeiling === '' ? undefined : Number(f.scaleCeiling),
  }
}

function RulesForm({ account, onSaved, onCancel }: { account: Account; onSaved: () => void; onCancel?: () => void }) {
  const [form, setForm] = useState(formFromProfile(account.scalingRules))
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  async function save() {
    await db.accounts.update(account.id!, { scalingRules: formToProfile(form) })
    onSaved()
  }

  return (
    <div>
      <div className="field-row">
        <label className="flex-1">Qualifying cycles required
          <input type="number" value={form.cyclesRequired} onChange={set('cyclesRequired')} />
        </label>
        <label className="flex-1">Min growth per cycle %
          <input type="number" value={form.minCycleGrowthPct} onChange={set('minCycleGrowthPct')} />
        </label>
      </div>
      <div className="field-row">
        <label className="flex-1">Min account age (days)
          <input type="number" value={form.minAgeDays} onChange={set('minAgeDays')} />
        </label>
        <label className="flex-1">Scale rate % per cycle
          <input type="number" value={form.scaleRatePct} onChange={set('scaleRatePct')} />
        </label>
        <label className="flex-1">Scale ceiling $ (optional)
          <input type="number" value={form.scaleCeiling} onChange={set('scaleCeiling')} />
        </label>
      </div>
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        {onCancel && <button onClick={onCancel}>Cancel</button>}
        <button onClick={save}>Save rules</button>
      </div>
    </div>
  )
}

export function ScalingCycleDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [growthPct, setGrowthPct] = useState('')
  const [fundedDate, setFundedDate] = useState(account.fundedDate ?? '')
  const [editingRules, setEditingRules] = useState(false)

  const liveAccount = useLiveQuery(() => db.accounts.get(account.id!), [account.id]) ?? account
  const rewards = useLiveQuery(() => db.rewards.where('accountId').equals(account.id!).sortBy('date'), [account.id]) ?? []

  const pack = SCALING_RULE_PACKS[account.firmId]
  const profile = liveAccount.scalingRules

  if (!profile || editingRules) {
    const showChooser = !profile && !editingRules && pack
    const showForm = editingRules || (!profile && !pack)

    return (
      <Modal title={`Scaling rules — ${account.label}`} onClose={onClose} minWidth={480} footer={null}>
        {showChooser && (
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={async () => { await db.accounts.update(account.id!, { scalingRules: pack }) }}>
              Load {account.firmId} scaling rules
            </button>
            <button onClick={() => setEditingRules(true)}>Set custom rules</button>
          </div>
        )}
        {showForm && (
          <RulesForm
            account={liveAccount}
            onSaved={() => setEditingRules(false)}
            onCancel={profile ? () => setEditingRules(false) : undefined}
          />
        )}
      </Modal>
    )
  }

  const qualifyingCycles = qualifyingCyclesCount(profile, rewards)
  const now = new Date()
  const fundedDateObj = fundedDate ? new Date(fundedDate) : null
  const ageDays = fundedDateObj ? Math.floor((now.getTime() - fundedDateObj.getTime()) / 86_400_000) : null
  const daysUntilAgeOk = ageDays === null ? null : Math.max(0, profile.minAgeDays - ageDays)
  const eligible = fundedDateObj ? scalingEligible(profile, fundedDateObj, qualifyingCycles, now) : false
  const nextSize = scaledSize(profile, account.size, (account.scaleEvents ?? 0) + 1)

  async function saveFundedDate() {
    await db.accounts.update(account.id!, { fundedDate })
  }

  async function saveReward() {
    await addReward(account.id!, todayISO(), Number(growthPct) / 100)
    setGrowthPct('')
  }

  return (
    <Modal
      title={`Scaling tracker — ${account.label}`}
      onClose={onClose}
      minWidth={380}
      footer={
        <>
          <button onClick={() => setEditingRules(true)}>Edit rules</button>
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
        <div>Qualifying cycles (≥{(profile.minCycleGrowthPct * 100).toFixed(0)}%): {qualifyingCycles}/{profile.cyclesRequired}</div>
        <div>Account age: {ageDays === null ? '— set funded date' : `${ageDays} days`}</div>
        <div>Days until {profile.minAgeDays}-day mark: {daysUntilAgeOk === null ? '—' : daysUntilAgeOk}</div>
        <div style={{ fontWeight: 600, color: eligible ? 'var(--good)' : 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {eligible ? 'Scaling eligible' : 'Not yet scaling eligible'}
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
            <li key={r.id}>{r.date}: {(r.growthPct * 100).toFixed(1)}% {r.growthPct >= profile.minCycleGrowthPct ? '✓' : ''}</li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
