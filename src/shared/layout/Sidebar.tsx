import styles from './Sidebar.module.css'

export type NavKey = 'dashboard' | 'cockpit' | 'tradecopier' | 'tradelog' | 'tradejournal' | 'plan' | 'brokers'

const NAV_ITEMS: { key: NavKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'cockpit', label: 'Prop Firm Management' },
  { key: 'tradecopier', label: 'Trade Copier' },
  { key: 'tradelog', label: 'Trade Log' },
  { key: 'tradejournal', label: 'Trade Journal' },
  { key: 'plan', label: 'Plan' },
  { key: 'brokers', label: 'Broker Connections' },
]

export function Sidebar({ active, onNavigate }: { active: NavKey; onNavigate: (key: NavKey) => void }) {
  return (
    <nav className={styles.nav}>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          onClick={() => onNavigate(item.key)}
          className={`${styles.navButton} ${active === item.key ? styles.navButtonActive : ''}`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
