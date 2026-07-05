export function TradeCopierPage() {
  return (
    <div>
      <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Trade Copier</h1>

      <div style={{
        marginTop: '1.5rem', padding: '2.5rem 1.5rem', textAlign: 'center',
        border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)',
      }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Coming soon</div>
        <div style={{ marginTop: '0.5rem', maxWidth: 440, marginInline: 'auto' }}>
          Mirror trades automatically across accounts (e.g. Apex's 4x250K copier group) instead of
          placing each one by hand.
        </div>
      </div>
    </div>
  )
}
