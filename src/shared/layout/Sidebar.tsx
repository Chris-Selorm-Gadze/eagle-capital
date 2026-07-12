import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBars, faGaugeHigh, faPenToSquare, faUserGear, faBookOpen,
  faBriefcase, faChartLine, faCalendarDays, faTableList, faClone, faPlug, faBrain,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import styles from './Sidebar.module.css'

export type NavKey = 'dashboard' | 'cockpit' | 'tradecopier' | 'tradelog' | 'tradejournal' | 'tradermanagement' | 'playbooks' | 'charting' | 'calendar' | 'brokers' | 'insights'

const NAV_ITEMS: { key: NavKey; label: string; icon: IconDefinition }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: faGaugeHigh },
  { key: 'tradejournal', label: 'Trade Journal', icon: faPenToSquare },
  { key: 'tradermanagement', label: 'Trader Management', icon: faUserGear },
  { key: 'playbooks', label: 'Playbooks', icon: faBookOpen },
  { key: 'insights', label: 'AI Insights', icon: faBrain },
  { key: 'cockpit', label: 'Prop Firm Manager', icon: faBriefcase },
  { key: 'charting', label: 'Charting', icon: faChartLine },
  { key: 'calendar', label: 'Economic Calendar', icon: faCalendarDays },
  { key: 'tradelog', label: 'Trade Log', icon: faTableList },
  { key: 'tradecopier', label: 'Trade Copier', icon: faClone },
  { key: 'brokers', label: 'Broker Connections', icon: faPlug },
]

const COLLAPSE_STORAGE_KEY = 'eaglecapital:sidebar-collapsed'

export function Sidebar({ active, onNavigate }: { active: NavKey; onNavigate: (key: NavKey) => void }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1')

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <nav className={`${styles.nav} ${collapsed ? styles.navCollapsed : ''}`}>
      <button
        type="button"
        className={styles.collapseToggle}
        onClick={toggleCollapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <FontAwesomeIcon icon={faBars} fixedWidth />
        {!collapsed && <span className={styles.collapseLabel}>Menu</span>}
      </button>

      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          onClick={() => onNavigate(item.key)}
          className={`${styles.navButton} ${active === item.key ? styles.navButtonActive : ''}`}
          aria-label={collapsed ? item.label : undefined}
        >
          <span className={styles.navIcon}><FontAwesomeIcon icon={item.icon} fixedWidth /></span>
          {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
          {collapsed && <span className={styles.navTooltip}>{item.label}</span>}
        </button>
      ))}
    </nav>
  )
}
