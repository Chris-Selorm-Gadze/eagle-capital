import { useEffect, useId, useRef, useState } from 'react'
import type { Playbook, PlaybookExample, Trade } from '../../../types'
import { addPlaybookExample, deletePlaybookExample } from '../../../db/playbookExamples'
import { uploadPlaybookImage } from '../../../lib/storage'
import { Modal } from '../../../shared/ui/Modal'
import { PlaybookStats } from './PlaybookStats'
import { exportPlaybookPdf, exportPlaybookDocx } from '../exportPlaybook'
import styles from '../PlaybooksPage.module.css'
import { errorMessage } from '../../../utils/errors'

function tradeChipLabel(trade: Trade): string {
  const sign = trade.pnl >= 0 ? '+' : '-'
  return `${trade.symbol} · ${trade.date} · ${sign}$${Math.abs(trade.pnl).toLocaleString()}`
}

export function PlaybookDetailDialog({
  playbook,
  examples,
  trades,
  userId,
  onClose,
  onChanged,
}: {
  playbook: Playbook
  examples: PlaybookExample[]
  trades: Trade[]
  userId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [selectedTradeIds, setSelectedTradeIds] = useState<string[]>([])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const fileInputId = useId()

  const tradeById = new Map(trades.map((t) => [t.id, t]))
  const linkedTrades = [...new Set(examples.map((e) => e.tradeId).filter((id): id is string => !!id))]
    .map((id) => tradeById.get(id))
    .filter((t): t is Trade => !!t)
  // First-glance view only needs one representative chart, not every uploaded example — the full
  // set (with delete controls) lives in the scrollable "All examples" list below.
  const previewExample = examples.find((e) => e.imageUrl)

  async function handleExport(format: 'pdf' | 'docx') {
    setError(null)
    setExporting(format)
    try {
      if (format === 'pdf') await exportPlaybookPdf(playbook, examples, tradeById, linkedTrades)
      else await exportPlaybookDocx(playbook, examples, tradeById, linkedTrades)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setExporting(null)
    }
  }

  useEffect(() => {
    if (!imageFile) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(imageFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  function toggleTrade(id: string) {
    setSelectedTradeIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  const canAdd = selectedTradeIds.length > 0 || !!imageFile

  async function handleAddExample() {
    if (!canAdd) return
    setError(null)
    setAdding(true)
    try {
      const imageUrl = imageFile ? await uploadPlaybookImage(userId, imageFile) : undefined
      if (selectedTradeIds.length > 0) {
        for (const tradeId of selectedTradeIds) {
          await addPlaybookExample(userId, { playbookId: playbook.id!, tradeId, imageUrl })
        }
      } else if (imageUrl) {
        await addPlaybookExample(userId, { playbookId: playbook.id!, imageUrl })
      }
      setSelectedTradeIds([])
      setImageFile(null)
      if (fileInput.current) fileInput.current.value = ''
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setAdding(false)
    }
  }

  async function handleDeleteExample(id: string) {
    if (!confirm('Delete this example?')) return
    setError(null)
    try {
      await deletePlaybookExample(id)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal
      title={playbook.name}
      onClose={onClose}
      minWidth={900}
      footer={
        <>
          <button onClick={() => handleExport('pdf')} disabled={exporting !== null}>
            {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </button>
          <button onClick={() => handleExport('docx')} disabled={exporting !== null}>
            {exporting === 'docx' ? 'Exporting…' : 'Export Word'}
          </button>
          <button onClick={onClose}>Close</button>
        </>
      }
    >
      {/* Left/right so the setup's own criteria and how it's actually performed are both visible
          at a glance, without scrolling past the chart examples to reach the win-rate numbers. */}
      <div className={styles.overview}>
        <div className={styles.overviewLeft}>
          {playbook.description && (
            <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{playbook.description}</p>
          )}
          <div style={{ marginTop: playbook.description ? '1.25rem' : 0, fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1.1rem' }}>
            Performance
          </div>
          <PlaybookStats trades={linkedTrades} />
        </div>

        <div className={styles.overviewRight}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1.1rem' }}>
            Example
          </div>
          {previewExample ? (
            <img src={previewExample.imageUrl} alt="Example chart" className={styles.cardExampleImage} />
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No example images yet.</p>
          )}
        </div>
      </div>

      <div style={{ marginTop: '1.25rem', fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1.1rem' }}>
        All examples {examples.length > 0 ? `(${examples.length})` : ''}
      </div>

      {examples.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No examples yet.</p>
      ) : (
        <div className={`${styles.exampleList} ${styles.exampleListScroll}`}>
          {examples.map((ex) => {
            const trade = ex.tradeId ? tradeById.get(ex.tradeId) : undefined
            return (
              <div key={ex.id} className={styles.example}>
                <div className={styles.exampleHeader}>
                  {trade ? <span className={styles.tradeChip}>{tradeChipLabel(trade)}</span> : <span />}
                  <button className="btn-ghost" onClick={() => handleDeleteExample(ex.id!)}>Delete</button>
                </div>
                {ex.note && <div className={styles.exampleNote}>{ex.note}</div>}
                {ex.imageUrl && <img src={ex.imageUrl} alt="Example chart" className={styles.exampleImage} />}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: '1.25rem', fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1.1rem' }}>
        Add example
      </div>

      <div className="field">
        <span style={{ display: 'block', marginBottom: '0.4rem' }}>
          Link logged trades{selectedTradeIds.length > 0 ? ` (${selectedTradeIds.length} selected)` : ''}
        </span>
        {trades.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No trades logged yet.</p>
        ) : (
          <div className={styles.tradePicker}>
            {trades.map((t) => (
              <label key={t.id} className={styles.tradePickerRow}>
                <input type="checkbox" checked={selectedTradeIds.includes(t.id!)} onChange={() => toggleTrade(t.id!)} />
                <span>{tradeChipLabel(t)}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <span style={{ display: 'block', marginBottom: '0.4rem' }}>Image (optional)</span>
        <label htmlFor={fileInputId} className={styles.fileButton}>
          {imageFile ? `Change image (${imageFile.name})` : 'Choose image'}
        </label>
        <input
          ref={fileInput}
          id={fileInputId}
          type="file"
          accept="image/*"
          className={styles.hiddenFileInput}
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {previewUrl && (
        <div className={styles.previewGrid}>
          <div className={styles.previewItem}>
            <img src={previewUrl} alt={imageFile?.name} className={styles.previewImage} />
            <button onClick={() => setImageFile(null)} className={styles.previewRemove}>✕</button>
          </div>
        </div>
      )}

      <button className="btn-primary" onClick={handleAddExample} disabled={!canAdd || adding} style={{ marginTop: '0.85rem' }}>
        {adding ? 'Adding…' : selectedTradeIds.length > 1 ? `Add ${selectedTradeIds.length} examples` : 'Add example'}
      </button>

      {error && <div style={{ color: 'var(--critical)', marginTop: '1rem' }}>{error}</div>}
    </Modal>
  )
}
