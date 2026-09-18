import { useMemo, useState } from 'react'
import { Modal } from '../../../shared/ui/Modal'
import { createJournalAccount, linkJournalAccount } from '../../../db/copierActions'
import type { TradingAccount } from '../../../db/copier'
import type { Account } from '../../../types'

import styles from './AddCopierAccountDialog.module.css'

/* Points a connected account at a dashboard account, so its trades get
 * journalled.
 *
 * Why this exists: the copier and the dashboard were two separate systems. The
 * copier writes trading_accounts and execution_events; the dashboard reads
 * accounts and trades. Copying six accounts all day therefore left the
 * dashboard reading "Your desk is empty", because an execution event records
 * that a copy was attempted and carries no prices and no profit — it can never
 * become a trade. The worker now reads each terminal's own deal history
 * instead, which is the broker's authoritative record, and this is what tells
 * it where to file the result.
 *
 * One dashboard account per connected account, enforced by a unique index. Six
 * followers mirroring one master would otherwise each write the same trade to
 * one dashboard account and multiply its P&L by six.
 */

function suggestedName(account: TradingAccount): string {
  return account.label || `${account.platform.toUpperCase()} · ${account.accountNumber}`
}

export function JournalLinkDialog({
  account, dashboardAccounts, takenIds, userId, onClose, onSaved,
}: {
  account: TradingAccount
  dashboardAccounts: Account[]
  /** Dashboard accounts already claimed by another connected account. */
  takenIds: Set<string>
  userId: string
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const linkedTo = dashboardAccounts.find((a) => a.id === account.journalAccountId) ?? null

  const available = useMemo(
    () => dashboardAccounts.filter(
      (a) => a.id && (!takenIds.has(a.id) || a.id === account.journalAccountId),
    ),
    [dashboardAccounts, takenIds, account.journalAccountId],
  )

  const [mode, setMode] = useState<'create' | 'existing'>(
    available.length > 0 ? 'existing' : 'create',
  )
  const [existingId, setExistingId] = useState(account.journalAccountId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const name = suggestedName(account)

  async function run(work: () => Promise<void>, message: string) {
    setSaving(true)
    setError(null)
    try {
      await work()
      onSaved(message)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const canSave = mode === 'create' || existingId !== ''

  return (
    <Modal
      title={`Journal ${name}`}
      onClose={onClose}
      dirty={!saving && (mode === 'create' || existingId !== (account.journalAccountId ?? ''))}
      minWidth={480}
      footer={
        <div className={styles.actions}>
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          {linkedTo && (
            <button
              type="button"
              className="btn-ghost"
              disabled={saving}
              onClick={() => run(
                () => linkJournalAccount(account.id, null),
                `${name} is no longer journalled. Trades already on the dashboard stay there.`,
              )}
            >
              Stop journalling
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !canSave}
            onClick={() => {
              if (mode === 'create') {
                run(
                  async () => {
                    await createJournalAccount(userId, {
                      id: account.id,
                      label: account.label,
                      accountNumber: account.accountNumber,
                      platform: account.platform,
                      balance: account.balance,
                      currency: account.currency,
                    })
                  },
                  `Created “${name}” on the dashboard. Its closed trades will appear within a couple of minutes.`,
                )
              } else {
                const target = dashboardAccounts.find((a) => a.id === existingId)
                run(
                  () => linkJournalAccount(account.id, existingId),
                  `${name} now reports to “${target?.label ?? 'that account'}”. Its closed trades will appear within a couple of minutes.`,
                )
              }
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <div className={styles.form}>
        <p className={styles.presetNote}>
          Closed positions on this account become trades on the dashboard — entry, exit,
          size and the broker’s own profit figure. Open positions are not journalled
          until they close.
        </p>

        {linkedTo && (
          <p className={styles.presetNote}>
            Currently reporting to <strong>{linkedTo.label}</strong>.
          </p>
        )}

        {available.length > 0 && (
          <label className={styles.checkRow}>
            <input
              type="radio"
              name="journal-mode"
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
            />
            <span>Use an account I already have</span>
          </label>
        )}

        {mode === 'existing' && available.length > 0 && (
          <label>
            Dashboard account
            <select value={existingId} onChange={(e) => setExistingId(e.target.value)}>
              <option value="">Choose an account…</option>
              {available.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}{a.stage === 'live' ? '' : ` · ${a.stage}`}
                </option>
              ))}
            </select>
            <span className={styles.hint}>
              Accounts already receiving trades from another connected account aren’t
              listed — one dashboard account takes trades from one broker account, or its
              P&amp;L would count the same fill twice.
            </span>
          </label>
        )}

        <label className={styles.checkRow}>
          <input
            type="radio"
            name="journal-mode"
            checked={mode === 'create'}
            onChange={() => setMode('create')}
          />
          <span>Create a new dashboard account for this</span>
        </label>

        {mode === 'create' && (
          <p className={styles.hint}>
            Creates <strong>{name}</strong> as a live account, starting at{' '}
            {account.balance === null
              ? 'the balance the worker last read'
              : `${account.balance.toLocaleString()} ${account.currency || 'USD'}`}.
            {' '}Drawdown limits and profit targets are left blank — those are your own
            numbers, and a guessed default reads as if it came from the firm.
          </p>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  )
}
