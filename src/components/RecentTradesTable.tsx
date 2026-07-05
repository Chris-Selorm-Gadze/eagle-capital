import type { Trade } from '../db/schema'

export function RecentTradesTable({
  trades,
  title = 'Recent trades',
  limit,
  onEdit,
  onDelete,
}: {
  trades: Trade[]
  title?: string
  limit?: number
  onEdit?: (trade: Trade) => void
  onDelete?: (id: number) => void
}) {
  const sorted = [...trades].sort((a, b) => (a.date < b.date ? 1 : -1))
  const rows = limit ? sorted.slice(0, limit) : sorted
  const showActions = Boolean(onEdit || onDelete)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', background: 'var(--surface)' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '0.4rem 0.3rem' }}>Date</th>
            <th style={{ padding: '0.4rem 0.3rem' }}>Symbol</th>
            <th style={{ padding: '0.4rem 0.3rem' }}>Side</th>
            <th style={{ padding: '0.4rem 0.3rem' }}>Qty</th>
            <th style={{ padding: '0.4rem 0.3rem' }}>Net P&amp;L</th>
            {showActions && <th style={{ padding: '0.4rem 0.3rem' }} />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={showActions ? 6 : 5} style={{ padding: '0.75rem 0.3rem', color: 'var(--text-muted)' }}>No trades yet.</td></tr>
          )}
          {rows.map((t) => (
            <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '0.4rem 0.3rem' }}>{t.date}</td>
              <td style={{ padding: '0.4rem 0.3rem' }}>{t.symbol}</td>
              <td style={{ padding: '0.4rem 0.3rem', textTransform: 'capitalize' }}>{t.side}</td>
              <td style={{ padding: '0.4rem 0.3rem' }}>{t.qty}</td>
              <td style={{ padding: '0.4rem 0.3rem', color: t.pnl >= 0 ? 'var(--good)' : 'var(--critical)', fontWeight: 600 }}>
                {t.pnl >= 0 ? '+' : '-'}${Math.abs(t.pnl).toLocaleString()}
              </td>
              {showActions && (
                <td style={{ padding: '0.4rem 0.3rem', whiteSpace: 'nowrap' }}>
                  {onEdit && <button onClick={() => onEdit(t)}>Edit</button>}
                  {onDelete && <button onClick={() => onDelete(t.id!)} style={{ marginLeft: onEdit ? '0.4rem' : 0 }}>Delete</button>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
