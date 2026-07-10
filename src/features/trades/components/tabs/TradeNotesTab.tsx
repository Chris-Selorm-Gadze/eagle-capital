import type { Trade } from '../../../../types'
import styles from '../TradeDetailPanel.module.css'

export function TradeNotesTab({ draft, onChange }: { draft: Trade; onChange: (patch: Partial<Trade>) => void }) {
  return (
    <textarea
      className={styles.journalTextarea}
      value={draft.notes ?? ''}
      onChange={(e) => onChange({ notes: e.target.value })}
      rows={12}
    />
  )
}
