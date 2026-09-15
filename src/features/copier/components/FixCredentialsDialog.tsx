import { useId, useState } from 'react'
import { Modal } from '../../../shared/ui/Modal'
import { fixCredentials } from '../../../db/copierActions'
import { getBrokerPreset, matchBrokerFromServer } from '../brokerPresets'
import type { TradingAccount } from '../../../db/copier'
import styles from './AddCopierAccountDialog.module.css'

/* Fixes a mistyped password without destroying the account.
 *
 * Before this existed the only remedy was deleting the account and adding it
 * again, which cascades — it takes the account's copy links, symbol mappings and
 * risk limits with it. Correcting a typo should not cost someone their
 * configuration.
 *
 * The server is editable here too, because a wrong server name fails in exactly
 * the same way a wrong password does: the broker rejects the login and the error
 * says nothing useful about which of the two was wrong.
 *
 * The existing password is never shown, because it is never sent to a browser.
 * It is stored encrypted with a key only the gateway holds, and the only thing
 * this dialog can do with it is replace it.
 */

export function FixCredentialsDialog({
  account, onClose, onSaved,
}: {
  account: TradingAccount
  onClose: () => void
  onSaved: () => void
}) {
  const serverListId = useId()
  const [password, setPassword] = useState('')
  const [brokerServer, setBrokerServer] = useState(account.brokerServer)
  const [terminalPath, setTerminalPath] = useState(account.terminalPath ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matched = matchBrokerFromServer(brokerServer)
  const preset = matched ? getBrokerPreset(matched.slug) : null
  const isMt5 = account.platform === 'mt5'
  const name = account.label || `${account.platform} · ${account.accountNumber}`

  async function handleSave() {
    if (password === '' || saving) return
    setSaving(true)
    setError(null)
    try {
      await fixCredentials(account.id, {
        password,
        brokerServer: brokerServer.trim() || undefined,
        terminalPath: isMt5 ? (terminalPath.trim() || null) : undefined,
      })
      setPassword('')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Fix credentials for ${name}`}
      onClose={onClose}
      dirty={password !== '' || brokerServer !== account.brokerServer}
      minWidth={460}
      footer={
        <div className={styles.actions}>
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={password === '' || saving}
          >
            {saving ? 'Saving…' : 'Save credentials'}
          </button>
        </div>
      }
    >
      <div className={styles.form}>
        <p className={styles.presetNote}>
          The account keeps its copy links, symbol mappings and risk limits. Only the
          credentials change. It goes back to <strong>Disconnected</strong> afterwards —
          test it again to find out whether the new ones work.
        </p>

        {account.lastError && (
          <p className={styles.presetNote}>
            Last error from the broker: <strong>{account.lastError}</strong>
          </p>
        )}

        <label>
          Account number
          <input value={account.accountNumber} disabled readOnly />
          {/* Changing the login would make this a different account, not a
              correction — and the unique index on (user, platform, number,
              server) exists to keep those separate. Remove and re-add instead. */}
          <span className={styles.hint}>
            Not editable. A different login is a different account — remove this one and
            connect the other.
          </span>
        </label>

        <label>
          Broker server
          <input
            value={brokerServer}
            onChange={(e) => setBrokerServer(e.target.value)}
            list={serverListId}
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id={serverListId}>
            {preset?.serverExamples.map((s) => <option key={s} value={s} />)}
          </datalist>
          <span className={styles.hint}>
            Copy it exactly from the MT5 login dialog. A wrong server reads as a rejected
            login, same as a wrong password.
          </span>
        </label>

        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            /* eslint-disable-next-line jsx-a11y/no-autofocus */
            autoFocus
          />
          <span className={styles.hint}>
            A <strong>master</strong> can use the investor (read-only) password — it is only
            watched. A <strong>follower</strong> needs the full trading password, because
            orders are placed on it.
          </span>
        </label>

        {isMt5 && (
          <label>
            Terminal path
            <input
              value={terminalPath}
              onChange={(e) => setTerminalPath(e.target.value)}
              placeholder="C:\\Program Files\\...\\terminal64.exe"
              autoComplete="off"
              spellCheck={false}
            />
            <span className={styles.hint}>
              Check this before blaming the password. Every broker ships its own MT5 build
              and they are not interchangeable — the wrong one fails the login and the error
              looks identical to bad credentials.
            </span>
          </label>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  )
}
