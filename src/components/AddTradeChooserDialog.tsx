export function AddTradeChooserDialog({
  onSelectManual,
  onSelectImport,
  onClose,
}: {
  onSelectManual: () => void
  onSelectImport: () => void
  onClose: () => void
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1.5rem', minWidth: 380 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Add trades</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.75rem' }}>
          <button
            onClick={onSelectManual}
            style={{
              textAlign: 'left', padding: '0.75rem 0.9rem', background: 'var(--surface-2)',
              border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Enter manually</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Log a single trade by hand.
            </div>
          </button>

          <button
            onClick={onSelectImport}
            style={{
              textAlign: 'left', padding: '0.75rem 0.9rem', background: 'var(--surface-2)',
              border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Import CSV</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Bulk-import trades from a FundedNext export file.
            </div>
          </button>

          <div
            style={{
              textAlign: 'left', padding: '0.75rem 0.9rem', background: 'var(--surface-2)',
              border: '1px solid var(--border)', borderRadius: 8, opacity: 0.55, cursor: 'not-allowed',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Connect a broker</span>
              <span style={{
                fontSize: '0.65rem', fontWeight: 600, padding: '1px 7px', borderRadius: 999,
                background: 'var(--surface-3)', color: 'var(--text-muted)',
              }}>
                COMING SOON
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Auto-sync trades directly from Tradovate, Rithmic, or your broker of choice.
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
