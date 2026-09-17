import { useEffect, useId, useState } from 'react'
import { Modal } from '../../../shared/ui/Modal'
import { connectAccount } from '../../../db/copierActions'
import { BROKER_PRESETS, getBrokerPreset, matchBrokerFromServer } from '../brokerPresets'
import styles from './AddCopierAccountDialog.module.css'

/* Connects a broker account to the copier.
 *
 * This is not the same thing as the prop-firm account you journal against. A
 * journalled account is a record; this one hands real trading credentials to a
 * worker that will place orders with them. They are deliberately separate: a
 * trader should be able to track a funded account without exposing its password
 * to anything.
 *
 * The password is posted once to the copier gateway, which encrypts it with
 * AES-256-GCM before it reaches a row. It is never written to this app's own
 * tables and never kept in browser storage.
 *
 * There is no terminal path to fill in. Which MT5 install an account opens with
 * is worker infrastructure, and asking a trader for
 * `C:\MT5\exness-3\terminal64.exe` both leaks the machine into the product and
 * fails the login in a way that reads exactly like a wrong password. The user
 * picks a broker; the worker claims a free matching terminal on the first
 * connection test. The Advanced override exists only for a non-standard install.
 */

const PLATFORMS = [
  { value: 'mt5', label: 'MetaTrader 5' },
  { value: 'mt4', label: 'MetaTrader 4' },
  { value: 'ctrader', label: 'cTrader' },
  { value: 'dxtrade', label: 'DXtrade' },
] as const

export function AddCopierAccountDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const serverListId = useId()
  const [platform, setPlatform] = useState<string>('mt5')
  /* No default broker, deliberately.
   *
   * This used to default to 'ftmo', which meant the terminal path silently
   * prefilled with FTMO's install for anyone who never opened the dropdown --
   * and every broker ships its own MT5 build, so pointing a Moneta account at
   * FTMO's terminal fails the login with an error that reads exactly like a
   * wrong password. A default that is right for one broker and quietly wrong for
   * every other is worse than no default. */
  const [brokerSlug, setBrokerSlug] = useState<string>('')
  const [accountNumber, setAccountNumber] = useState('')
  const [brokerServer, setBrokerServer] = useState('')
  const [password, setPassword] = useState('')
  const [label, setLabel] = useState('')
  const [terminalPath, setTerminalPath] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preset = getBrokerPreset(brokerSlug)
  const isMt5 = platform === 'mt5'

  /* Typing a server name is the more reliable signal of which broker this is —
   * people paste it straight from the MT5 login dialog. If it names a broker
   * other than the one selected, follow the server. */
  useEffect(() => {
    const matched = matchBrokerFromServer(brokerServer)
    if (matched && matched.slug !== brokerSlug) setBrokerSlug(matched.slug)
  }, [brokerServer, brokerSlug])

  const canSave = accountNumber.trim() !== '' && brokerServer.trim() !== ''
    && password !== '' && (!isMt5 || brokerSlug !== '')

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      await connectAccount({
        platform,
        accountNumber: accountNumber.trim(),
        brokerServer: brokerServer.trim(),
        password,
        label: label.trim() || undefined,
        brokerSlug: isMt5 ? brokerSlug : undefined,
        terminalPath: terminalPath.trim() || undefined,
      })
      setPassword('')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const dirty = accountNumber !== '' || brokerServer !== '' || password !== '' || label !== ''

  return (
    <Modal
      title="Connect an account to the copier"
      onClose={onClose}
      dirty={dirty}
      minWidth={460}
      footer={
        <div className={styles.actions}>
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Connecting…' : 'Connect account'}
          </button>
        </div>
      }
    >
      <div className={styles.form}>
        <div className={styles.row}>
          <label className={styles.grow}>
            Platform
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>

          {isMt5 && (
            <label className={styles.grow}>
              Broker
              <select value={brokerSlug} onChange={(e) => setBrokerSlug(e.target.value)}>
                <option value="">Select your broker…</option>
                {BROKER_PRESETS.map((b) => (
                  <option key={b.slug} value={b.slug}>{b.name}{b.verified ? '' : ' *'}</option>
                ))}
              </select>
              <span className={styles.hint}>
                Decides which MT5 install on the worker this account opens with. Brokers are
                not interchangeable, so getting it wrong fails the login in a way that looks
                like a wrong password.
              </span>
            </label>
          )}
        </div>

        {isMt5 && preset && !preset.verified && (
          <p className={styles.presetNote}>
            <strong>*</strong> No confirmed install path for this one — type the full path to
            its <code>terminal64.exe</code> below yourself.
          </p>
        )}

        {isMt5 && preset?.note && <p className={styles.presetNote}>{preset.note}</p>}

        <label>
          Broker server
          <input
            value={brokerServer}
            onChange={(e) => setBrokerServer(e.target.value)}
            placeholder={preset?.serverExamples[0] ?? 'e.g. ICMarketsSC-MT5'}
            list={serverListId}
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id={serverListId}>
            {preset?.serverExamples.map((s) => <option key={s} value={s} />)}
          </datalist>
          <span className={styles.hint}>
            Copy it exactly from the MT5 login dialog. A wrong server reads as a rejected login.
          </span>
        </label>

        <label>
          Account number
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="e.g. 51234567"
            autoComplete="off"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <span className={styles.hint}>
            A <strong>master</strong> can use the investor (read-only) password — it is only watched.
            A <strong>follower</strong> needs the full trading password, because orders are placed on it.
          </span>
        </label>

        <label>
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="optional" />
        </label>

        {isMt5 && (
          <div className={styles.advanced}>
            <button
              type="button"
              className={styles.advancedToggle}
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
            >
              {showAdvanced ? '− Advanced' : '+ Advanced'}
            </button>

            {showAdvanced && (
              <label>
                Terminal path
                <input
                  value={terminalPath}
                  onChange={(e) => setTerminalPath(e.target.value)}
                  placeholder="leave empty — the worker assigns one"
                  autoComplete="off"
                  spellCheck={false}
                />
                {/* An escape hatch, not the normal path. Assignment keeps each
                    account on its own install, which is what makes copies run in
                    parallel instead of queueing behind a login switch. */}
                <span className={styles.hint}>
                  Leave this empty. The worker picks a free MT5 install for this broker and
                  remembers it. Only set it if you have a non-standard install the worker
                  cannot find on its own.
                </span>
              </label>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  )
}
