import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account } from '../../../db/schema'
import { recordPayout } from '../../../db/payouts'
import { todayISO } from '../../../db/sessions'
import { checkPayout, payoutProgress } from '../../risk/payoutRules'
import { PAYOUT_RULE_PACKS } from '../rulePacks'
import { Modal } from '../../../shared/ui/Modal'
import type { PayoutRuleProfile } from '../../../types'
import styles from './PayoutPlannerDialog.module.css'

function GateRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={styles.gateRow}>
      <span style={{ color: ok ? 'var(--good)' : 'var(--critical)' }}>{ok ? '✓' : '✗'}</span>
      <span>{label}</span>
    </div>
  )
}

function formFromProfile(profile?: PayoutRuleProfile) {
  return {
    tradingDaysBetween: String(profile?.tradingDaysBetween ?? 8),
    profitableDaysRequired: String(profile?.profitableDaysRequired ?? 5),
    profitableDayMin: String(profile?.profitableDayMin ?? 50),
    safetyNetBalance: profile?.safetyNetBalance !== undefined ? String(profile.safetyNetBalance) : '',
    safetyNetPayoutCount: profile?.safetyNetPayoutCount !== undefined ? String(profile.safetyNetPayoutCount) : '',
    windfallSharePct: profile?.windfallShare !== undefined ? String(profile.windfallShare * 100) : '',
    windfallAppliesToPayoutCount: profile?.windfallAppliesToPayoutCount !== undefined ? String(profile.windfallAppliesToPayoutCount) : '',
    minPayout: profile?.minPayout !== undefined ? String(profile.minPayout) : '',
    capCount: profile?.capFirstNPayouts !== undefined ? String(profile.capFirstNPayouts.count) : '',
    capAmount: profile?.capFirstNPayouts !== undefined ? String(profile.capFirstNPayouts.cap) : '',
    splitFullUpTo: profile?.splitFullUpTo !== undefined ? String(profile.splitFullUpTo) : '',
    splitAfterPct: String((profile?.splitAfter ?? 1) * 100),
  }
}

function formToProfile(f: ReturnType<typeof formFromProfile>): PayoutRuleProfile {
  return {
    tradingDaysBetween: Number(f.tradingDaysBetween),
    profitableDaysRequired: Number(f.profitableDaysRequired),
    profitableDayMin: Number(f.profitableDayMin),
    safetyNetBalance: f.safetyNetBalance === '' ? undefined : Number(f.safetyNetBalance),
    safetyNetPayoutCount: f.safetyNetPayoutCount === '' ? undefined : Number(f.safetyNetPayoutCount),
    windfallShare: f.windfallSharePct === '' ? undefined : Number(f.windfallSharePct) / 100,
    windfallAppliesToPayoutCount: f.windfallAppliesToPayoutCount === '' ? undefined : Number(f.windfallAppliesToPayoutCount),
    minPayout: f.minPayout === '' ? undefined : Number(f.minPayout),
    capFirstNPayouts: f.capCount === '' || f.capAmount === '' ? undefined : { count: Number(f.capCount), cap: Number(f.capAmount) },
    splitFullUpTo: f.splitFullUpTo === '' ? undefined : Number(f.splitFullUpTo),
    splitAfter: Number(f.splitAfterPct) / 100,
  }
}

function RulesForm({
  account,
  onSaved,
  onCancel,
}: {
  account: Account
  onSaved: () => void
  onCancel?: () => void
}) {
  const [form, setForm] = useState(formFromProfile(account.payoutRules))
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  async function save() {
    await db.accounts.update(account.id!, { payoutRules: formToProfile(form) })
    onSaved()
  }

  return (
    <div>
      <div className="field-row">
        <label className="flex-1">Trading days between payouts
          <input type="number" value={form.tradingDaysBetween} onChange={set('tradingDaysBetween')} />
        </label>
        <label className="flex-1">Min profitable days
          <input type="number" value={form.profitableDaysRequired} onChange={set('profitableDaysRequired')} />
        </label>
        <label className="flex-1">Profitable day min $
          <input type="number" value={form.profitableDayMin} onChange={set('profitableDayMin')} />
        </label>
      </div>
      <div className="field-row">
        <label className="flex-1">Safety net balance $ (optional)
          <input type="number" value={form.safetyNetBalance} onChange={set('safetyNetBalance')} />
        </label>
        <label className="flex-1">Applies to first N payouts
          <input type="number" value={form.safetyNetPayoutCount} onChange={set('safetyNetPayoutCount')} />
        </label>
      </div>
      <div className="field-row">
        <label className="flex-1">Windfall share % (optional)
          <input type="number" value={form.windfallSharePct} onChange={set('windfallSharePct')} />
        </label>
        <label className="flex-1">Applies to first N payouts
          <input type="number" value={form.windfallAppliesToPayoutCount} onChange={set('windfallAppliesToPayoutCount')} />
        </label>
      </div>
      <div className="field-row">
        <label className="flex-1">Min payout $ (optional)
          <input type="number" value={form.minPayout} onChange={set('minPayout')} />
        </label>
        <label className="flex-1">Cap: first N payouts
          <input type="number" value={form.capCount} onChange={set('capCount')} />
        </label>
        <label className="flex-1">Cap amount $
          <input type="number" value={form.capAmount} onChange={set('capAmount')} />
        </label>
      </div>
      <div className="field-row">
        <label className="flex-1">100% split up to $ (optional)
          <input type="number" value={form.splitFullUpTo} onChange={set('splitFullUpTo')} />
        </label>
        <label className="flex-1">Split after %
          <input type="number" value={form.splitAfterPct} onChange={set('splitAfterPct')} />
        </label>
      </div>
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        {onCancel && <button onClick={onCancel}>Cancel</button>}
        <button onClick={save}>Save rules</button>
      </div>
    </div>
  )
}

export function PayoutPlannerDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [requested, setRequested] = useState('')
  const [editingRules, setEditingRules] = useState(false)

  const liveAccount = useLiveQuery(() => db.accounts.get(account.id!), [account.id]) ?? account
  const payouts = useLiveQuery(() => db.payouts.where('accountId').equals(account.id!).sortBy('date'), [account.id]) ?? []
  const sessions = useLiveQuery(() => db.sessions.where('accountId').equals(account.id!).sortBy('date'), [account.id]) ?? []

  const pack = PAYOUT_RULE_PACKS[account.firmId]
  const profile = liveAccount.payoutRules

  if (!profile || editingRules) {
    const showChooser = !profile && !editingRules && pack
    const showForm = editingRules || (!profile && !pack)

    return (
      <Modal title={`Payout rules — ${account.label}`} onClose={onClose} minWidth={480} footer={null}>
        {showChooser && (
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={async () => { await db.accounts.update(account.id!, { payoutRules: pack }) }}>
              Load {account.firmId} payout rules
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

  const lastDate = payouts.at(-1)?.date
  const sessionsSince = sessions.filter((s) => !lastDate || s.date > lastDate)
  const progress = payoutProgress(profile, sessionsSince)
  const payoutNumber = (account.payoutsDone ?? 0) + 1
  const result = checkPayout(profile, { payoutNumber, balance: liveAccount.balance, ...progress })

  async function save() {
    await recordPayout(liveAccount, todayISO(), Number(requested))
    setRequested('')
  }

  return (
    <Modal
      title={`Payout planner — ${account.label}`}
      onClose={onClose}
      minWidth={380}
      footer={
        <>
          <button onClick={() => setEditingRules(true)}>Edit rules</button>
          <button onClick={onClose}>Close</button>
          <button onClick={save} disabled={!requested}>Save</button>
        </>
      }
    >
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Requesting payout #{payoutNumber}</div>

      <div className={styles.gates}>
        <GateRow ok={progress.tradingDaysSinceLast >= profile.tradingDaysBetween}
          label={`${profile.tradingDaysBetween} trading days: ${progress.tradingDaysSinceLast}/${profile.tradingDaysBetween}`} />
        <GateRow ok={progress.profitableDays >= profile.profitableDaysRequired}
          label={`${profile.profitableDaysRequired}x $${profile.profitableDayMin}+ days: ${progress.profitableDays}/${profile.profitableDaysRequired}`} />
        {profile.safetyNetBalance !== undefined && (profile.safetyNetPayoutCount === undefined || payoutNumber <= profile.safetyNetPayoutCount) && (
          <GateRow ok={liveAccount.balance >= profile.safetyNetBalance}
            label={
              liveAccount.balance >= profile.safetyNetBalance
                ? `Safety net: balance $${liveAccount.balance.toLocaleString()} clears $${profile.safetyNetBalance.toLocaleString()}`
                : `Safety net: need $${(profile.safetyNetBalance - liveAccount.balance).toLocaleString()} more balance`
            } />
        )}
        {profile.windfallShare !== undefined && (profile.windfallAppliesToPayoutCount === undefined || payoutNumber <= profile.windfallAppliesToPayoutCount) && (
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
