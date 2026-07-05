export function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.9rem 1.1rem', minWidth: 170, background: 'var(--surface)' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '0.15rem', color: color ?? 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
