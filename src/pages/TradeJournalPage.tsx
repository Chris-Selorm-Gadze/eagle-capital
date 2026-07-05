export function TradeJournalPage() {
  return (
    <div>
      <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Trade Journal</h1>

      <div style={{
        marginTop: '1.5rem', padding: '2.5rem 1.5rem', textAlign: 'center',
        border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)',
      }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Coming soon</div>
        <div style={{ marginTop: '0.5rem', maxWidth: 440, marginInline: 'auto' }}>
          Write reflections per trade, attach chart screenshots, and tag setups so you can review
          what worked later — beyond what the Trade Log's raw numbers show.
        </div>
      </div>
    </div>
  )
}
