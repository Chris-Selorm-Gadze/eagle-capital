import { useId, useState } from 'react'
import type { ReportCard, Trade } from '../../../types'
import { uploadReportCardImage } from '../../../lib/storage'
import { errorMessage } from '../../../utils/errors'
import styles from '../ReportCardPage.module.css'

function tradeLabel(trade: Trade): string {
  const sign = trade.pnl >= 0 ? '+' : '-'
  return `${trade.symbol} · ${trade.side} · ${sign}$${Math.abs(trade.pnl).toLocaleString()}`
}

export function TradeLinkSection({
  card,
  trades,
  userId,
  onChange,
}: {
  card: ReportCard
  trades: Trade[]
  userId: string
  onChange: (patch: Partial<ReportCard>) => void
}) {
  const selected = card.tradeIds ?? []
  const sameDayTrades = trades.filter((t) => t.date === card.date)
  const candidates = sameDayTrades.length > 0 ? sameDayTrades : trades
  const images = card.imageUrls ?? []

  const fileInputId = useId()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  function toggle(id: string) {
    onChange({ tradeIds: selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id] })
  }

  async function handleFileSelected(file: File | undefined) {
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      const url = await uploadReportCardImage(userId, file)
      onChange({ imageUrls: [...images, url] })
    } catch (err) {
      setUploadError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  function removeImage(url: string) {
    onChange({ imageUrls: images.filter((u) => u !== url) })
  }

  return (
    <section className={styles.section} id="sec-trades">
      <div className={styles.secHead}>
        <span className={styles.secNum}>06</span>
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

      <div style={{ marginTop: '1rem' }}>
        <span style={{ display: 'block', marginBottom: '0.4rem' }}>Screenshots (optional)</span>
        <label htmlFor={fileInputId} className={styles.fileButton}>
          {uploading ? 'Uploading…' : '+ Add screenshot'}
        </label>
        <input
          id={fileInputId}
          type="file"
          accept="image/*"
          className={styles.hiddenFileInput}
          disabled={uploading}
          onChange={(e) => handleFileSelected(e.target.files?.[0])}
        />
      </div>

      {images.length > 0 && (
        <div className={styles.previewGrid}>
          {images.map((url) => (
            <div key={url} className={styles.previewItem}>
              <img src={url} alt="Trade screenshot" className={styles.previewImage} />
              <button onClick={() => removeImage(url)} className={styles.previewRemove}>✕</button>
            </div>
          ))}
        </div>
      )}

      {uploadError && <div style={{ color: 'var(--critical)', marginTop: '0.5rem' }}>{uploadError}</div>}
    </section>
  )
}
