import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AuthPage } from '../auth/AuthPage'
import { ComingSoonSection } from '../../shared/ui/ComingSoonSection'
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import { BROKERS } from './brokerCatalog'
import styles from './BrokerConnectionsPage.module.css'

interface BrokerConnection {
  id: string
  broker_id: string
  label: string
  status: 'pending' | 'connected' | 'error' | 'disconnected'
}

const BADGE_CLASS: Record<BrokerConnection['status'], string> = {
  pending: styles.badgePending,
  connected: styles.badgeConnected,
  error: styles.badgeError,
  disconnected: styles.badgeDisconnected,
}

function brokerName(brokerId: string): string {
  return BROKERS.find((b) => b.id === brokerId)?.name ?? brokerId
}

export function BrokerConnectionsPage() {
  const { user, loading } = useAuth()
  const [connections, setConnections] = useState<BrokerConnection[]>([])
  const [fetching, setFetching] = useState(true)
  const [brokerId, setBrokerId] = useState(BROKERS[0].id)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setFetching(true)
    const { data, error } = await supabase
      .from('broker_connections')
      .select('id, broker_id, label, status')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setConnections(data ?? [])
    setFetching(false)
  }

  useEffect(() => {
    if (user) load()
  }, [user])

  async function addConnection() {
    if (!user || !label.trim()) return
    setError(null)
    const { error } = await supabase
      .from('broker_connections')
      .insert({ user_id: user.id, broker_id: brokerId, label: label.trim() })
    if (error) setError(error.message)
    else {
      setLabel('')
      await load()
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
              <span className={styles.broker}>{brokerName(c.broker_id)}</span>
              <span className={styles.label}>{c.label}</span>
              <span className={`${styles.badge} ${BADGE_CLASS[c.status]}`}>{c.status}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <ComingSoonSection>
          Live trade sync isn't wired up yet — connections here are just labeled placeholders for now. Actually
          pulling fills from each broker's API is the next phase.
        </ComingSoonSection>
      </div>
    </div>
  )
}
