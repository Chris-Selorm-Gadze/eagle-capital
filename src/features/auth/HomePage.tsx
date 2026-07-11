import { AuthPage } from './AuthPage'
import styles from './HomePage.module.css'

// Simple gate in front of the app — sign in first, everything else after.
// Placeholder look; a full landing design comes later.
export function HomePage() {
  return (
    <div className={styles.root}>
      <div className={styles.brand}>
        <span aria-hidden="true" className={styles.logo}>🦅</span>
        <span className={styles.brandName}>EagleCapital</span>
      </div>
      <AuthPage />
    </div>
  )
}
