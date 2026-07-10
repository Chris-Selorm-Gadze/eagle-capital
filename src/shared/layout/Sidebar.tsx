import styles from './Sidebar.module.css'

export type NavKey = 'dashboard' | 'cockpit' | 'tradecopier' | 'tradelog' | 'tradejournal' | 'tradermanagement' | 'playbooks' | 'charting' | 'calendar' | 'brokers'

const NAV_ITEMS: { key: NavKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'tradejournal', label: 'Trade Journal' },
  { key: 'tradermanagement', label: 'Trader Management' },
  { key: 'playbooks', label: 'Playbooks' },
  { key: 'cockpit', label: 'Prop Firm Management' },
  { key: 'charting', label: 'Charting' },
  { key: 'calendar', label: 'Economic Calendar' },
  { key: 'tradelog', label: 'Trade Log' },
  { key: 'tradecopier', label: 'Trade Copier' },
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
