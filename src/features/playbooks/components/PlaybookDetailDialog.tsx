import { useEffect, useId, useRef, useState } from 'react'
import type { Playbook, PlaybookExample, Trade } from '../../../types'
import { addPlaybookExample, deletePlaybookExample } from '../../../db/playbookExamples'
import { uploadPlaybookImage } from '../../../lib/storage'
import { Modal } from '../../../shared/ui/Modal'
import { PlaybookStats } from './PlaybookStats'
import styles from '../PlaybooksPage.module.css'
import { errorMessage } from '../../../utils/errors'

function tradeChipLabel(trade: Trade): string {
  const sign = trade.pnl >= 0 ? '+' : '-'
  return `${trade.symbol} · ${trade.date} · ${sign}$${Math.abs(trade.pnl).toLocaleString()}`
}

function buildShareText(playbook: Playbook, examples: PlaybookExample[], tradeById: Map<string | undefined, Trade | undefined>): string {
  const lines = [`PLAYBOOK — ${playbook.name}${playbook.grade ? ` (${playbook.grade})` : ''}`]
  if (playbook.description) lines.push('', playbook.description)
  if (examples.length > 0) {
    lines.push('', `EXAMPLES (${examples.length})`)
    examples.forEach((ex, i) => {
      const trade = ex.tradeId ? tradeById.get(ex.tradeId) : undefined
      if (ex.note) lines.push(`${i + 1}. ${ex.note}`)
      else if (trade) lines.push(`${i + 1}. ${tradeChipLabel(trade)}`)
    })
  }
  return lines.join('\n')
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
  const [shareStatus, setShareStatus] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const fileInputId = useId()

  const tradeById = new Map(trades.map((t) => [t.id, t]))
  const linkedTrades = [...new Set(examples.map((e) => e.tradeId).filter((id): id is string => !!id))]
    .map((id) => tradeById.get(id))
    .filter((t): t is Trade => !!t)

  async function handleShare() {
    const text = buildShareText(playbook, examples, tradeById)
    if (navigator.share) {
      try {
        await navigator.share({ title: playbook.name, text })
      } catch {
        // user cancelled the share sheet — not an error
      }
      return
    }
    await navigator.clipboard.writeText(text)
    setShareStatus('Copied to clipboard')
    setTimeout(() => setShareStatus(''), 1600)
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
      minWidth={480}
      footer={
        <>
          {shareStatus && <span style={{ color: 'var(--good)', fontSize: '0.78rem', alignSelf: 'center' }}>{shareStatus}</span>}
          <button onClick={handleShare}>Share</button>
          <button onClick={onClose}>Close</button>
        </>
      }
    >
      {playbook.description && (
        <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{playbook.description}</p>
      )}

      <div style={{ marginTop: '1.25rem', fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
        Performance
      </div>
      <PlaybookStats trades={linkedTrades} />

      <div style={{ marginTop: '1.25rem', fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
        Examples
      </div>

      {examples.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>No examples yet.</p>
      ) : (
        <div className={styles.exampleList}>
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

      <div style={{ marginTop: '1.25rem', fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
        Add example
      </div>

      <div className="field" style={{ marginTop: '0.75rem' }}>
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
