import { useState } from 'react'
import type { Account, SessionLog } from '../../../db/schema'
import { logSession, deleteSession, todayISO } from '../../../db/sessions'
import { Modal } from '../../../shared/ui/Modal'
import { errorMessage } from '../../../utils/errors'
import { useConfirm } from '../../../shared/ui/confirm'
import styles from './LogSessionDialog.module.css'

const BLANK = { pnl: '0', trades: '0', consecutiveLosses: '0', highestUnrealized: '', rulesFollowed: true, notes: '' }

export function LogSessionDialog({
  account,
  sessions,
  hasTradesOn,
  userId,
  onClose,
  onSaved,
}: {
  account: Account
  /** Existing sessions for this account, so a past one can be reviewed or corrected. */
  sessions: SessionLog[]
  /** Whether logged trades already cover a date — a session on such a day is
   * kept as a journal note but contributes no P&L (trades win). */
  hasTradesOn: (date: string) => boolean
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const confirm = useConfirm()
  const [date, setDate] = useState(todayISO())
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof typeof BLANK>(key: K, value: (typeof BLANK)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // Anything moved off the blank form counts as work worth protecting.
  const dirty =
    form.pnl !== BLANK.pnl || form.trades !== BLANK.trades ||
    form.consecutiveLosses !== BLANK.consecutiveLosses ||
    form.highestUnrealized !== BLANK.highestUnrealized ||
    form.rulesFollowed !== BLANK.rulesFollowed || form.notes !== BLANK.notes

  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? 1 : -1))
  const editingExisting = sessions.find((s) => s.date === date)
  const overlapsTrades = hasTradesOn(date)

  /** Loads a saved session into the form so it can be corrected — previously a
   * session could be written and never seen again, so a typo'd P&L moved the
   * balance permanently with no way to reach it. */
  function load(session: SessionLog) {
    setDate(session.date)
    setForm({
      pnl: String(session.pnl),
      trades: String(session.trades),
      consecutiveLosses: String(session.consecutiveLosses),
      highestUnrealized: session.highestUnrealized !== undefined ? String(session.highestUnrealized) : '',
      rulesFollowed: session.rulesFollowed,
      notes: session.notes ?? '',
    })
  }

  async function save() {
    setError(null)
    setSaving(true)
    try {
      await logSession(userId, account.id!, {
        date,
        pnl: Number(form.pnl),
        trades: Number(form.trades),
        consecutiveLosses: Number(form.consecutiveLosses),
        highestUnrealized: form.highestUnrealized === '' ? undefined : Number(form.highestUnrealized),
        rulesFollowed: form.rulesFollowed,
        notes: form.notes || undefined,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(session: SessionLog) {
    if (!(await confirm({
      title: `Delete the session for ${session.date}?`,
      description: 'The account balance is recalculated without it.',
      confirmLabel: 'Delete session',
      destructive: true,
    }))) return
    setError(null)
    try {
      await deleteSession(session.id!)
      onSaved()
      if (session.date === date) setForm(BLANK)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal
      title={`Sessions — ${account.label}`}
      onClose={onClose}
      dirty={dirty && !saving}
      minWidth={420}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editingExisting ? 'Update session' : 'Save session'}
          </button>
        </>
      }
    >
      {sorted.length > 0 && (
        <div className={styles.history}>
          <div className={styles.historyLabel}>Logged sessions</div>
          <ul className={styles.historyList}>
            {sorted.slice(0, 8).map((s) => (
              <li key={s.id} className={s.date === date ? styles.historyRowActive : styles.historyRow}>
                <button className={styles.historyOpen} onClick={() => load(s)}>
                  <span className={styles.historyDate}>{s.date}</span>
                  <span style={{ color: s.pnl >= 0 ? 'var(--good)' : 'var(--critical)' }}>
                    {s.pnl >= 0 ? '+' : '-'}${Math.abs(s.pnl).toLocaleString()}
                  </span>
                  <span className={styles.historyMeta}>{s.trades} trade{s.trades === 1 ? '' : 's'}</span>
                </button>
                <button className={styles.rowDelete} onClick={() => remove(s)} aria-label={`Delete session for ${s.date}`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The date was hardcoded to today, so a session missed yesterday could
          never be entered at all. */}
      <label className="field">
        Date
        <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </label>

      {editingExisting && (
        <p className={styles.notice}>Updating the session already saved for {date}.</p>
      )}

      {overlapsTrades && (
        <p className={styles.notice}>
          You have logged trades on {date}. Those are the source of that day's P&amp;L — this
          session is kept as a journal note, but its P&amp;L won't be counted again.
        </p>
      )}

      <div className="field-row">
        <label className="flex-1">
          P&amp;L
          <input type="number" value={form.pnl} onChange={(e) => set('pnl', e.target.value)} />
        </label>
        <label className="flex-1">
          Trades
          <input type="number" min="0" value={form.trades} onChange={(e) => set('trades', e.target.value)} />
        </label>
      </div>

      <div className="field-row">
        <label className="flex-1">
          Consecutive losses
          <input type="number" min="0" value={form.consecutiveLosses} onChange={(e) => set('consecutiveLosses', e.target.value)} />
        </label>
        <label className="flex-1">
          Peak balance today
          <input
            type="number"
            value={form.highestUnrealized}
            placeholder="optional"
            onChange={(e) => set('highestUnrealized', e.target.value)}
          />
        </label>
      </div>

      <label className="field-checkbox">
        <input type="checkbox" checked={form.rulesFollowed} onChange={(e) => set('rulesFollowed', e.target.checked)} />
        Rules followed
      </label>

      <label className="field">
        Notes
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>

      {error && <div style={{ color: 'var(--critical)', marginTop: '1rem' }}>{error}</div>}
    </Modal>
  )
}
