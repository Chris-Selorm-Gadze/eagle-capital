export type NavKey = 'dashboard' | 'cockpit' | 'tradecopier' | 'tradelog' | 'tradejournal' | 'plan'

const NAV_ITEMS: { key: NavKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'cockpit', label: 'Prop Firm Management' },
  { key: 'tradecopier', label: 'Trade Copier' },
  { key: 'tradelog', label: 'Trade Log' },
  { key: 'tradejournal', label: 'Trade Journal' },
  { key: 'plan', label: 'Plan' },
]

export function Sidebar({ active, onNavigate }: { active: NavKey; onNavigate: (key: NavKey) => void }) {
  return (
    <nav
      style={{
        width: 200, flexShrink: 0, borderRight: '1px solid var(--border)',
        background: 'var(--surface)', padding: '1rem 0.75rem', boxSizing: 'border-box',
      }}
    >
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          onClick={() => onNavigate(item.key)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', marginBottom: '0.35rem',
            background: active === item.key ? 'var(--surface-3)' : 'transparent',
            border: active === item.key ? '1px solid var(--accent)' : '1px solid transparent',
            color: active === item.key ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
