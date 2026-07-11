import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import type { Trade } from '../../../../types'
import styles from '../TradeDetailPanel.module.css'

export function TradeTagsTab({ draft, onChange }: { draft: Trade; onChange: (patch: Partial<Trade>) => void }) {
  const [input, setInput] = useState('')
  const tags = draft.tags ?? []

  function addTag() {
    const trimmed = input.trim()
    if (!trimmed || tags.includes(trimmed)) {
      setInput('')
      return
    }
    onChange({ tags: [...tags, trimmed] })
    setInput('')
  }

  function removeTag(tag: string) {
    onChange({ tags: tags.filter((t) => t !== tag) })
  }

  return (
    <div>
      {tags.length === 0 ? (
        <p className={styles.hint}>No tags yet.</p>
      ) : (
        <div className={styles.chipRow}>
          {tags.map((t) => (
            <span key={t} className={styles.chip}>
              {t}
              <button type="button" onClick={() => removeTag(t)} className={styles.chipRemove}><FontAwesomeIcon icon={faXmark} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="field-row" style={{ marginTop: '1rem' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder="e.g. FOMO, A+ setup, news event"
        />
        <button type="button" onClick={addTag}>Add tag</button>
      </div>
    </div>
  )
}
