import { useState } from 'react'
import type { Account, Trade } from '../../db/schema'
import { deleteTrade, deleteTrades } from '../../db/trades'
import { errorMessage } from '../../utils/errors'
import { RecentTradesTable } from './components/RecentTradesTable'
import { AddTradeDialog } from './components/AddTradeDialog'
import { useConfirm } from '../../shared/ui/confirm'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorNotice, PageHeader } from '@/shared/ui/page'
import { TableIcon } from 'lucide-react'

/* The Trade Log had no page heading at all — it opened straight onto a bare
 * "Delete all" button above a table, so the most destructive control on the page
 * was the first thing on it. The header names the page and gives that button
 * somewhere to belong. */

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
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          visible.length > 0 ? (
            <Button
              disabled={deleting}
              onClick={handleDeleteAll}
              size="sm"
              variant="destructive"
            >
              {deleting ? 'Deleting…' : `Delete all ${visible.length}`}
            </Button>
          ) : undefined
        }
        description="Every trade on record. Filter it down, correct a row, or remove what shouldn't be here."
        title="Trade Log"
      />

      {error && <ErrorNotice message={error} />}

      {trades.length === 0 ? (
        <EmptyState
          description="Log one by hand or import a CSV from your broker, and it'll show up here."
          icon={<TableIcon />}
          title="No trades on record"
        />
      ) : (
        <RecentTradesTable
          trades={trades}
          title={`All trades (${trades.length})`}
          onEdit={(t) => setEditingTrade(t)}
          onDelete={handleDelete}
          onVisibleChange={setVisible}
        />
      )}
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
