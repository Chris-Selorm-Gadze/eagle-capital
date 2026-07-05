export type NavKey = 'dashboard' | 'cockpit' | 'tradelog' | 'plan'

const NAV_ITEMS: { key: NavKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'cockpit', label: 'Risk Cockpit' },
  { key: 'tradelog', label: 'Trade Log' },
  { key: 'plan', label: 'Plan' },
]

export function Sidebar({ active, onNavigate }: { active: NavKey; onNavigate: (key: NavKey) => void }) {
  return (
    <nav
      style={{
        width: 200, flexShrink: 0, borderRight: '1px solid var(--border)',
        background: 'var(--surface)', padding: '1rem 0.75rem', minHeight: '100vh', boxSizing: 'border-box',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '1.1rem', padding: '0 0.5rem', marginBottom: '1.5rem' }}>
        Prop Tracker
      </div>
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
