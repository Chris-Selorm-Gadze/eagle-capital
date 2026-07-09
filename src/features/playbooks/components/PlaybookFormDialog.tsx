import { useEffect, useId, useRef, useState } from 'react'
import type { Playbook, PlaybookGrade } from '../../../types'
import { addPlaybook, updatePlaybook } from '../../../db/playbooks'
import { addPlaybookExample } from '../../../db/playbookExamples'
import { uploadPlaybookImage } from '../../../lib/storage'
import { Modal } from '../../../shared/ui/Modal'
import styles from '../PlaybooksPage.module.css'
import { errorMessage } from '../../../utils/errors'

const GRADES: PlaybookGrade[] = ['A+', 'A', 'B', 'C']

const GRADE_CLASS: Record<PlaybookGrade, string> = {
  'A+': styles.gradeAPlus,
  A: styles.gradeA,
  B: styles.gradeB,
  C: styles.gradeC,
}

export function PlaybookFormDialog({
  userId,
  playbook,
  onClose,
  onSaved,
}: {
  userId: string
  playbook?: Playbook
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(playbook?.name ?? '')
  const [description, setDescription] = useState(playbook?.description ?? '')
  const [grade, setGrade] = useState<PlaybookGrade | undefined>(playbook?.grade)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputId = useId()
  const fileInput = useRef<HTMLInputElement>(null)

  const canSave = name.trim() !== ''

  useEffect(() => {
    const urls = imageFiles.map((f) => URL.createObjectURL(f))
    setPreviewUrls(urls)
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)) }
  }, [imageFiles])

  function addImageFiles(files: FileList | null) {
    if (!files) return
    setImageFiles((prev) => [...prev, ...Array.from(files)])
  }

  function removeImageFile(index: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function save() {
    setError(null)
    setSaving(true)
    try {
      const input: Playbook = { name: name.trim(), description: description || undefined, grade }
      let playbookId: string
      if (playbook?.id) {
        await updatePlaybook(playbook.id, input)
        playbookId = playbook.id
      } else {
        playbookId = await addPlaybook(userId, input)
      }

      for (const file of imageFiles) {
        const imageUrl = await uploadPlaybookImage(userId, file)
        await addPlaybookExample(userId, { playbookId, imageUrl })
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={playbook ? 'Edit playbook' : 'New playbook'}
      onClose={onClose}
      minWidth={420}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={save} disabled={!canSave || saving}>
            {saving ? (imageFiles.length ? 'Saving & uploading…' : 'Saving…') : 'Save'}
          </button>
        </>
      }
    >
      <label className="field">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Opening range breakout" />
      </label>

      <label className="field">
        Description / entry criteria
        <textarea
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What defines this setup — context, trigger, invalidation, target."
        />
      </label>

      <label className="field">Grade</label>
      <div className={styles.stamps}>
        {GRADES.map((g) => (
          <div
            key={g}
            className={`${styles.stamp} ${GRADE_CLASS[g]} ${grade === g ? styles.stampOn : ''}`}
            onClick={() => setGrade(g)}
          >
            {g}
          </div>
        ))}
      </div>

      <div className="field" style={{ marginTop: '1rem' }}>
        <span style={{ display: 'block', marginBottom: '0.4rem' }}>Image examples (optional)</span>
        <label htmlFor={fileInputId} className={styles.fileButton}>
          {imageFiles.length > 0 ? `+ Add more images (${imageFiles.length} selected)` : '+ Add images'}
        </label>
        <input
          ref={fileInput}
          id={fileInputId}
          type="file"
          accept="image/*"
          className={styles.hiddenFileInput}
          onChange={(e) => addImageFiles(e.target.files)}
        />
      </div>

      {imageFiles.length > 0 && (
        <div className={styles.previewGrid}>
          {imageFiles.map((f, i) => (
            <div key={i} className={styles.previewItem}>
              <img src={previewUrls[i]} alt={f.name} className={styles.previewImage} />
              <button onClick={() => removeImageFile(i)} className={styles.previewRemove}>✕</button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: 'var(--critical)', marginTop: '1rem' }}>{error}</div>}
    </Modal>
  )
}
