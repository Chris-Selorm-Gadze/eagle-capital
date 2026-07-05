export function TopNav() {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.65rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>🦅</span>
      <span style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '0.01em' }}>EagleCapital</span>
    </div>
  )
}
