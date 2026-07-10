import { useEffect, useState } from 'react'
import type { TradingRule } from '../../types'
import { listTradingRules, addTradingRule, updateTradingRule, deleteTradingRule } from '../../db/tradingRules'
import { errorMessage } from '../../utils/errors'
import styles from './RulesPage.module.css'

export function RulesPage({ userId }: { userId: string }) {
  const [rules, setRules] = useState<TradingRule[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [isCore, setIsCore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setRules(await listTradingRules())
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function handleAdd() {
    if (!text.trim()) return
    setError(null)
    try {
      await addTradingRule(userId, { text: text.trim(), isCore })
      setText('')
      setIsCore(false)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleToggleCore(rule: TradingRule) {
    setError(null)
    try {
      await updateTradingRule(rule.id!, { isCore: !rule.isCore })
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this rule?')) return
    setError(null)
    try {
      await deleteTradingRule(id)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Your own trading rules — independent of any prop firm. Mark the non-negotiable ones as Core.
      </p>

      {error && <div style={{ color: 'var(--critical)', marginBottom: '1rem' }}>{error}</div>}

      {rules.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>No rules yet — add your first one below.</p>
      ) : (
        <div className={`card ${styles.list}`}>
          {rules.map((r) => (
            <div key={r.id} className={styles.row}>
              <span className={styles.text}>{r.text}</span>
              {r.isCore && <span className={styles.coreBadge}>Core</span>}
              <div className={styles.rowActions}>
                <button type="button" onClick={() => handleToggleCore(r)}>{r.isCore ? 'Unmark core' : 'Mark core'}</button>
                <button type="button" onClick={() => handleDelete(r.id!)} className="btn-ghost">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={`card ${styles.addCard}`}>
        <span className={styles.addLabel}>Add a new rule</span>
        <div className={styles.addRow}>
          <input
            className={styles.addInput}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. No trades after 3 consecutive losses"
          />
          <label className={styles.coreCheckbox}>
            <input type="checkbox" checked={isCore} onChange={(e) => setIsCore(e.target.checked)} />
            Core
          </label>
          <button type="button" className="btn-primary" onClick={handleAdd} disabled={!text.trim()}>Add rule</button>
        </div>
      </div>
    </div>
  )
}
