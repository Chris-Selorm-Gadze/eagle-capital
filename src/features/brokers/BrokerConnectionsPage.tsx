import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AuthPage } from '../auth/AuthPage'
import { ComingSoonSection } from '../../shared/ui/ComingSoonSection'
import { Modal } from '../../shared/ui/Modal'
import { supabaseConfigured } from '../../lib/supabaseClient'
import { brokerSyncConfigured, submitTradovateCredentials, submitMetaApiCredentials, triggerSync } from '../../lib/brokerSyncClient'
import { listBrokerConnections, addBrokerConnection, linkAccount, deleteBrokerConnection, type BrokerConnection } from '../../db/brokerConnections'
import { errorMessage } from '../../utils/errors'
import { BROKERS } from './brokerCatalog'
import { MetaApiCredentialFields } from './MetaApiCredentialFields'
import type { Account } from '../../types'
import styles from './BrokerConnectionsPage.module.css'

const BADGE_CLASS: Record<BrokerConnection['status'], string> = {
  pending: styles.badgePending,
  connected: styles.badgeConnected,
  error: styles.badgeError,
  disconnected: styles.badgeDisconnected,
}

function brokerName(brokerId: string): string {
  return BROKERS.find((b) => b.id === brokerId)?.name ?? brokerId
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString()
}

const SYNC_ENABLED_BROKERS = new Set(['tradovate', 'mt5'])

function TradovateCredentialFields({ name, setName, password, setPassword, deviceId, setDeviceId }: {
  name: string; setName: (v: string) => void
  password: string; setPassword: (v: string) => void
  deviceId: string; setDeviceId: (v: string) => void
}) {
  return (
    <>
      <p className={styles.credentialHint}>
        Verified once against Tradovate immediately, then encrypted and stored server-side — never
        kept in this browser.
      </p>
      <label className="field">
        Username
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <label className="field">
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
      </label>
      <label className="field">
        Device ID
        <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="any stable identifier, e.g. eaglecapital-1" />
      </label>
    </>
  )
}

function CredentialDialog({ connection, onClose, onSaved }: { connection: BrokerConnection; onClose: () => void; onSaved: () => void }) {
  const isMetaApi = connection.brokerId === 'mt5'
  const [name, setName] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [server, setServer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = isMetaApi ? Boolean(login && password && server) : Boolean(name && password)

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const result = isMetaApi
        ? await submitMetaApiCredentials(connection.id, { login, password, server })
        : await submitTradovateCredentials(connection.id, { name, password, deviceId })
      if (result.status !== 'connected') {
        setError(result.error ?? 'Could not verify these credentials.')
        return
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Connect ${brokerName(connection.brokerId)}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={submit} className="btn-primary" disabled={submitting || !canSubmit}>
            {submitting ? 'Verifying…' : 'Connect'}
          </button>
        </>
      }
    >
      {isMetaApi ? (
        <MetaApiCredentialFields login={login} setLogin={setLogin} password={password} setPassword={setPassword} server={server} setServer={setServer} />
      ) : (
        <TradovateCredentialFields name={name} setName={setName} password={password} setPassword={setPassword} deviceId={deviceId} setDeviceId={setDeviceId} />
      )}
      {error && <div style={{ color: 'var(--critical)', marginTop: '0.75rem' }}>{error}</div>}
    </Modal>
  )
}

export function BrokerConnectionsPage({ accounts, userId }: { accounts: Account[]; userId: string }) {
  const { user, loading } = useAuth()
  const [connections, setConnections] = useState<BrokerConnection[]>([])
  const [fetching, setFetching] = useState(true)
  const [brokerId, setBrokerId] = useState(BROKERS[0].id)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [credentialTarget, setCredentialTarget] = useState<BrokerConnection | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  async function load() {
    setFetching(true)
    try {
      setConnections(await listBrokerConnections())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    if (user) load()
  }, [user])

  async function addConnection() {
    if (!label.trim()) return
    setError(null)
    try {
      await addBrokerConnection(userId, brokerId, label.trim())
      setLabel('')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleLinkAccount(connectionId: string, accountId: string) {
    setError(null)
    try {
      await linkAccount(connectionId, accountId || null)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleSync(connectionId: string) {
    setSyncingId(connectionId)
    setError(null)
    try {
      await triggerSync(connectionId)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSyncingId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this broker connection?')) return
    setError(null)
    try {
      await deleteBrokerConnection(id)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (loading) return null

  if (!supabaseConfigured) {
    return (
      <div>
        <h1 className="page-title">Broker Connections</h1>
        <ComingSoonSection>
          Supabase isn't configured yet — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local to enable
          accounts and broker connections.
        </ComingSoonSection>
      </div>
    )
  }

  if (!user) {
    return (
      <div>
        <h1 className="page-title">Broker Connections</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Sign in to connect and manage broker accounts.</p>
        <AuthPage />
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">Broker Connections</h1>

      <div className={`card ${styles.addRow}`}>
        <label className="flex-1">
          Broker
          <select value={brokerId} onChange={(e) => setBrokerId(e.target.value)}>
            {BROKERS.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Tradovate — main account" />
        </label>
        <button className="btn-primary" onClick={addConnection} disabled={!label.trim()}>Add connection</button>
      </div>

      {error && <div style={{ color: 'var(--critical)', marginBottom: '1rem' }}>{error}</div>}

      {fetching ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : connections.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No broker connections yet.</p>
      ) : (
        <div className={`card ${styles.list}`}>
          {connections.map((c) => (
            <div key={c.id} className={styles.row}>
              <span className={styles.broker}>{brokerName(c.brokerId)}</span>
              <span className={styles.label}>{c.label}</span>
              <span className={`${styles.badge} ${BADGE_CLASS[c.status]}`}>{c.status}</span>

              {SYNC_ENABLED_BROKERS.has(c.brokerId) && (
                <div className={styles.linkRow}>
                  <select value={c.accountId ?? ''} onChange={(e) => handleLinkAccount(c.id, e.target.value)}>
                    <option value="">— link to an account —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>

                  {c.accountId && c.status !== 'connected' && (
                    <button onClick={() => setCredentialTarget(c)} disabled={!brokerSyncConfigured}>Connect credentials</button>
                  )}

                  {c.status === 'connected' && (
                    <>
                      <span className={styles.syncMeta}>
                        {c.lastSyncedAt ? `Synced ${relativeTime(c.lastSyncedAt)}` : 'Not synced yet'}
                      </span>
                      <button onClick={() => handleSync(c.id)} disabled={syncingId === c.id || !brokerSyncConfigured}>
                        {syncingId === c.id ? 'Syncing…' : 'Sync now'}
                      </button>
                    </>
                  )}

                  {c.lastError && <span className={styles.syncError} title={c.lastError}>⚠ sync error</span>}
                </div>
              )}

              <button onClick={() => handleDelete(c.id)} className="btn-ghost">Delete</button>
            </div>
          ))}
        </div>
      )}

      {!connections.some((c) => c.status === 'connected') && (
        <div style={{ marginTop: '1.5rem' }}>
          <ComingSoonSection>
            Add a broker connection above, link it to an account, and connect credentials to start
            syncing real balance and trade history automatically.
          </ComingSoonSection>
        </div>
      )}

      {credentialTarget && (
        <CredentialDialog connection={credentialTarget} onClose={() => setCredentialTarget(null)} onSaved={load} />
      )}
    </div>
  )
}
