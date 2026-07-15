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
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const fileInputId = useId()

  const tradeById = new Map(trades.map((t) => [t.id, t]))
  const linkedTrades = [...new Set(examples.map((e) => e.tradeId).filter((id): id is string => !!id))]
    .map((id) => tradeById.get(id))
    .filter((t): t is Trade => !!t)
  // First-glance view shows up to 2 representative charts (stacked to fill whatever height the
  // description + performance tiles take up), not every uploaded example — the full set (with
  // delete controls) lives in the scrollable "All examples" list below.
  const previewExamples = examples.filter((e) => e.imageUrl).slice(0, 2)

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
    if (imageFiles.length === 0) { setPreviewUrls([]); return }
    const urls = imageFiles.map((f) => URL.createObjectURL(f))
    setPreviewUrls(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [imageFiles])

  function toggleTrade(id: string) {
    setSelectedTradeIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  function removeImageFile(index: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const canAdd = selectedTradeIds.length > 0 || imageFiles.length > 0

  async function handleAddExample() {
    if (!canAdd) return
    setError(null)
    setAdding(true)
    try {
      const imageUrls = await Promise.all(imageFiles.map((f) => uploadPlaybookImage(userId, f)))
      if (selectedTradeIds.length > 0) {
        // Multiple images alongside linked trades has no clean 1:1 mapping — attach the first
        // image (if any) to every linked trade, same as when only a single image could be chosen.
        for (const tradeId of selectedTradeIds) {
          await addPlaybookExample(userId, { playbookId: playbook.id!, tradeId, imageUrl: imageUrls[0] })
        }
      } else {
        // No trade to attach to — each uploaded image becomes its own standalone example.
        for (const imageUrl of imageUrls) {
          await addPlaybookExample(userId, { playbookId: playbook.id!, imageUrl })
        }
      }
      setSelectedTradeIds([])
      setImageFiles([])
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
            {previewExamples.length > 1 ? 'Examples' : 'Example'}
          </div>
          {previewExamples.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No example images yet.</p>
          ) : (
            <div className={styles.exampleStack}>
              {previewExamples.map((ex) => (
                <img key={ex.id} src={ex.imageUrl} alt="Example chart" className={styles.exampleStackImage} />
              ))}
            </div>
          )}
        </div>
      </div>

      <details className={styles.collapsibleSection} style={{ marginTop: '1.25rem' }}>
        <summary className={styles.collapsibleHeader}>
          All examples {examples.length > 0 ? `(${examples.length})` : ''}
        </summary>
        <div className={styles.collapsibleBody}>
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
        </div>
      </details>

      <div style={{ marginTop: '1.25rem', fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1.1rem' }}>
        Add example
      </div>

      <div className="field">
        <details className={styles.collapsibleSection}>
          <summary className={styles.collapsibleSummarySmall}>
            Link logged trades{selectedTradeIds.length > 0 ? ` (${selectedTradeIds.length} selected)` : ''}
          </summary>
          <div className={styles.collapsibleBody}>
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
        </details>
      </div>

      <div className="field">
        <span style={{ display: 'block', marginBottom: '0.4rem' }}>Images (optional)</span>
        <label htmlFor={fileInputId} className={styles.fileButton}>
          {imageFiles.length > 0 ? `Change images (${imageFiles.length} selected)` : 'Choose images'}
        </label>
        <input
          ref={fileInput}
          id={fileInputId}
          type="file"
          accept="image/*"
          multiple
          className={styles.hiddenFileInput}
          onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {previewUrls.length > 0 && (
        <div className={styles.previewGrid}>
          {previewUrls.map((url, i) => (
            <div key={url} className={styles.previewItem}>
              <img src={url} alt={imageFiles[i]?.name} className={styles.previewImage} />
              <button onClick={() => removeImageFile(i)} className={styles.previewRemove}>✕</button>
            </div>
          ))}
        </div>
      )}

      <button className="btn-primary" onClick={handleAddExample} disabled={!canAdd || adding} style={{ marginTop: '0.85rem' }}>
        {adding
          ? 'Adding…'
          : selectedTradeIds.length > 1
            ? `Add ${selectedTradeIds.length} examples`
            : imageFiles.length > 1
              ? `Add ${imageFiles.length} images`
              : 'Add example'}
      </button>

      {error && <div style={{ color: 'var(--critical)', marginTop: '1rem' }}>{error}</div>}
    </Modal>
  )
}
