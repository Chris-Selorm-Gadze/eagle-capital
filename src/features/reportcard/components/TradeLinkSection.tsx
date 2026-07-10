import type { ReportCard, Trade } from '../../../types'
import styles from '../ReportCardPage.module.css'

function tradeLabel(trade: Trade): string {
  const sign = trade.pnl >= 0 ? '+' : '-'
  return `${trade.symbol} · ${trade.side} · ${sign}$${Math.abs(trade.pnl).toLocaleString()}`
}

export function TradeLinkSection({
  card,
  trades,
  onChange,
}: {
  card: ReportCard
  trades: Trade[]
  onChange: (patch: Partial<ReportCard>) => void
}) {
  const selected = card.tradeIds ?? []
  const sameDayTrades = trades.filter((t) => t.date === card.date)
  const candidates = sameDayTrades.length > 0 ? sameDayTrades : trades

  function toggle(id: string) {
    onChange({ tradeIds: selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id] })
  }

  return (
    <section className={styles.section}>
      <div className={styles.secHead}>
        <span className={styles.secNum}>＋</span>
        <h2>Attach the trade(s)</h2>
        <span className={styles.secNote}>Link this report to the real entries it's about</span>
      </div>
      {trades.length === 0 ? (
        <p className={styles.hint}>No trades logged yet — log some in the Trade Log to attach them here.</p>
      ) : (
        <>
          <div className={styles.tradePicker}>
            {candidates.map((t) => (
              <label key={t.id} className={styles.tradePickerRow}>
                <input type="checkbox" checked={selected.includes(t.id!)} onChange={() => toggle(t.id!)} />
                <span>{tradeLabel(t)}</span>
              </label>
            ))}
          </div>
          {sameDayTrades.length === 0 && (
            <p className={styles.hint}>No trades logged for {card.date} — showing all logged trades instead.</p>
          )}
        </>
      )}
    </section>
  )
}
