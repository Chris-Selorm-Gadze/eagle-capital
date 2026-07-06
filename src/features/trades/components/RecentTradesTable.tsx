import type { Trade } from '../../../db/schema'
import styles from './RecentTradesTable.module.css'

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
    <div className="card">
      <div className={styles.title}>{title}</div>
      <table className={styles.table}>
        <thead>
          <tr className={styles.headerRow}>
            <th className={styles.cell}>Date</th>
            <th className={styles.cell}>Symbol</th>
            <th className={styles.cell}>Side</th>
            <th className={styles.cell}>Qty</th>
            <th className={styles.cell}>Net P&amp;L</th>
            {showActions && <th className={styles.cell} />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={showActions ? 6 : 5} className={styles.emptyRow}>No trades yet.</td></tr>
          )}
          {rows.map((t) => (
            <tr key={t.id} className={styles.row}>
              <td className={styles.cell}>{t.date}</td>
              <td className={styles.cell}>{t.symbol}</td>
              <td className={`${styles.cell} ${styles.side}`}>{t.side}</td>
              <td className={styles.cell}>{t.qty}</td>
              <td className={`${styles.cell} ${styles.pnl}`} style={{ color: t.pnl >= 0 ? 'var(--good)' : 'var(--critical)' }}>
                {t.pnl >= 0 ? '+' : '-'}${Math.abs(t.pnl).toLocaleString()}
              </td>
              {showActions && (
                <td className={`${styles.cell} ${styles.actionsCell}`}>
                  {onEdit && <button onClick={() => onEdit(t)}>Edit</button>}
                  {onDelete && <button onClick={() => onDelete(t.id!)} className={onEdit ? styles.deleteButton : undefined}>Delete</button>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
