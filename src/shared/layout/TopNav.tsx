import { useEffect, useState } from 'react'
import styles from './TopNav.module.css'
import { useAuth } from '../../features/auth/AuthContext'
import { AuthPage } from '../../features/auth/AuthPage'
import { Modal } from '../ui/Modal'
import { ensureProfile, updateUsername, type Profile } from '../../db/profiles'
import { errorMessage } from '../../utils/errors'

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export function TopNav() {
  const { user, loading, signOut } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [usernameInput, setUsernameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) setShowAuth(false)
  }, [user])

  useEffect(() => {
    if (!user) {
      setProfile(null)
      return
    }
    let cancelled = false
    ensureProfile(user.id, user.email).then((p) => {
      if (cancelled) return
      setProfile(p)
      setUsernameInput(p.username)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  async function handleSaveUsername() {
    if (!user) return
    setError(null)
    setSaving(true)
    try {
      const updated = await updateUsername(user.id, usernameInput)
      setProfile(updated)
      setUsernameInput(updated.username)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const displayName = profile?.username ?? user?.email ?? '?'

  return (
    <div className={styles.root}>
      <span aria-hidden="true" className={styles.logo}>🦅</span>
      <span className={styles.brand}>EagleCapital</span>
      <div className={styles.account}>
        {!loading && (user ? (
          <>
            <button type="button" className={styles.userButton} onClick={() => setShowAccount(true)}>
              <span className={styles.avatar}>{initials(displayName)}</span>
              <span className={styles.username}>{displayName}</span>
            </button>
            {/* Sign out sits directly in the bar — signing out shouldn't require opening the
                account modal first just to reach the button inside it. */}
            <button type="button" className="btn-ghost" onClick={() => signOut()}>Sign out</button>
          </>
        ) : (
          <button onClick={() => setShowAuth(true)}>Sign in</button>
        ))}
      </div>

      {showAuth && (
        <Modal title="Account" onClose={() => setShowAuth(false)} footer={<button onClick={() => setShowAuth(false)}>Close</button>}>
          <AuthPage />
        </Modal>
      )}

      {showAccount && user && (
        <Modal
          title="Your account"
          onClose={() => setShowAccount(false)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => signOut()}>Sign out</button>
              <button onClick={() => setShowAccount(false)}>Close</button>
            </>
          }
        >
          <div className={styles.accountHeader}>
            <span className={styles.avatarLarge}>{initials(displayName)}</span>
            <div className={styles.accountEmail}>{user.email}</div>
          </div>

          <label className="field" style={{ marginTop: '1.25rem', marginBottom: '1rem' }}>
            Username
            <input value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="Choose a username" />
          </label>
          <button
            className="btn-primary"
            onClick={handleSaveUsername}
            disabled={saving || !usernameInput.trim() || usernameInput === profile?.username}
          >
            {saving ? 'Saving…' : 'Save username'}
          </button>

          {error && <div style={{ color: 'var(--critical)', marginTop: '0.75rem' }}>{error}</div>}
        </Modal>
      )}
    </div>
  )
}
