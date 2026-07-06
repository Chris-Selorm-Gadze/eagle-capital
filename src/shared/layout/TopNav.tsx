import styles from './TopNav.module.css'

export function TopNav() {
  return (
    <div className={styles.root}>
      <span aria-hidden="true" className={styles.logo}>🦅</span>
      <span className={styles.brand}>EagleCapital</span>
    </div>
  )
}
