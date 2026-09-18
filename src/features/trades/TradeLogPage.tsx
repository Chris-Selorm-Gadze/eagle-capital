import { useState } from 'react'
import type { Account, Trade } from '../../db/schema'
import { deleteTrade, deleteTrades } from '../../db/trades'
import { errorMessage } from '../../utils/errors'
import { RecentTradesTable } from './components/RecentTradesTable'
import { AddTradeDialog } from './components/AddTradeDialog'
import { useConfirm } from '../../shared/ui/confirm'

export function TradeLogPage({
  trades,
  accounts,
  userId,
  onChanged,
}: {
  trades: Trade[]
  accounts: Account[]
  userId: string
  onChanged: () => void
}) {
  const confirm = useConfirm()
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // What the table's own symbol/side/outcome filters currently leave visible.
  // "Delete all" acts on this rather than on every trade passed in, so it can
  // never remove rows the filters are hiding — the button says "shown here" and
  // now that is literally true.
  const [visible, setVisible] = useState<Trade[]>(trades)

  // The row's Delete button used to fire straight through: no confirmation, no
  // error handling, no undo. It was the only destructive action in the app
  // without a prompt — while "Delete all" right above it had one.
  async function handleDelete(id: string) {
    const trade = trades.find((t) => t.id === id)
    const label = trade ? `${trade.symbol} on ${trade.date}` : 'this trade'
    if (!(await confirm({
      title: `Delete ${label}?`,
      description: 'This cannot be undone, and it changes the account balance derived from it.',
      confirmLabel: 'Delete trade',
      destructive: true,
    }))) return
    setError(null)
    try {
      await deleteTrade(id)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleDeleteAll() {
    const count = visible.length
    if (count === 0) return
    const narrowed = count < trades.length
    if (!(await confirm({
      title: `Delete all ${count} trade${count === 1 ? '' : 's'} shown here?`,
      description: narrowed
        ? `This cannot be undone. The ${trades.length - count} trade${trades.length - count === 1 ? '' : 's'} hidden by the filters will be kept.`
        : 'This cannot be undone.',
      confirmLabel: 'Delete all',
      destructive: true,
    }))) return
    setError(null)
    setDeleting(true)
    try {
      await deleteTrades(visible.map((t) => t.id!))
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      {visible.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <button type="button" className="btn-ghost" onClick={handleDeleteAll} disabled={deleting}>
            {deleting ? 'Deleting…' : `Delete all ${visible.length}`}
          </button>
        </div>
      )}

      {error && <div style={{ color: 'var(--critical)', marginBottom: '1rem' }}>{error}</div>}

      <RecentTradesTable
        trades={trades}
        title={`All trades (${trades.length})`}
        onEdit={(t) => setEditingTrade(t)}
        onDelete={handleDelete}
        onVisibleChange={setVisible}
      />
      {editingTrade && (
        <AddTradeDialog
          accounts={accounts}
          trade={editingTrade}
          userId={userId}
          onClose={() => setEditingTrade(null)}
          onSaved={onChanged}
          onAccountAdded={onChanged}
        />
      )}
    </div>
  )
}
