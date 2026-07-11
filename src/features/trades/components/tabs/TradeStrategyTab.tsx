import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import type { Playbook, PlaybookExample } from '../../../../types'
import { addPlaybookExample, deletePlaybookExample } from '../../../../db/playbookExamples'
import { errorMessage } from '../../../../utils/errors'
import styles from '../TradeDetailPanel.module.css'

export function TradeStrategyTab({
  tradeId,
  userId,
  playbooks,
  playbookExamples,
  onChanged,
}: {
  tradeId: string
  userId: string
  playbooks: Playbook[]
  playbookExamples: PlaybookExample[]
  onChanged: () => void
}) {
  const linked = playbookExamples.filter((e) => e.tradeId === tradeId)
  const linkedPlaybookIds = new Set(linked.map((e) => e.playbookId))
  const attachable = playbooks.filter((p) => !linkedPlaybookIds.has(p.id!))

  const [selected, setSelected] = useState(attachable[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleAttach() {
    if (!selected) return
    setError(null)
    try {
      await addPlaybookExample(userId, { playbookId: selected, tradeId })
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleDetach(exampleId: string) {
    setError(null)
    try {
      await deletePlaybookExample(exampleId)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div>
      {linked.length === 0 ? (
        <p className={styles.hint}>Not linked to a playbook yet.</p>
      ) : (
        <div className={styles.chipRow}>
          {linked.map((e) => {
            const playbook = playbooks.find((p) => p.id === e.playbookId)
            return (
              <span key={e.id} className={styles.chip}>
                {playbook?.name ?? 'Unknown playbook'}
                <button type="button" onClick={() => handleDetach(e.id!)} className={styles.chipRemove}><FontAwesomeIcon icon={faXmark} /></button>
              </span>
            )
          })}
        </div>
      )}

      {playbooks.length === 0 ? (
        <p className={styles.hint} style={{ marginTop: '1rem' }}>No playbooks yet — create one under Playbooks first.</p>
      ) : attachable.length > 0 ? (
        <div className="field-row" style={{ marginTop: '1rem' }}>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {attachable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" onClick={handleAttach}>Attach</button>
        </div>
      ) : null}

      {error && <div style={{ color: 'var(--critical)', marginTop: '0.75rem' }}>{error}</div>}
    </div>
  )
}
