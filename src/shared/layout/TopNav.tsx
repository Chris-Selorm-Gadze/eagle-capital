import { useEffect, useState } from 'react'
import styles from './TopNav.module.css'
import { useAuth } from '../../features/auth/AuthContext'
import { AuthPage } from '../../features/auth/AuthPage'
import { Modal } from '../ui/Modal'

export function TopNav() {
  const { user, loading, signOut } = useAuth()
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    if (user) setShowAuth(false)
  }, [user])

  return (
    <div className={styles.root}>
      <span aria-hidden="true" className={styles.logo}>🦅</span>
      <span className={styles.brand}>EagleCapital</span>
      <div className={styles.account}>
        {!loading && (user ? (
          <>
            <span className={styles.email}>{user.email}</span>
            <button onClick={() => signOut()}>Sign out</button>
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
    </div>
  )
}
