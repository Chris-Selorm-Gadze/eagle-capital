import { useState } from 'react'
import type { Account, Trade } from '../../db/schema'
import { deleteTrade } from '../../db/trades'
import { RecentTradesTable } from './components/RecentTradesTable'
import { AddTradeDialog } from './components/AddTradeDialog'

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
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null)

  async function handleDelete(id: string) {
    await deleteTrade(id)
    onChanged()
  }

  return (
    <div>
      <RecentTradesTable
        trades={trades}
        title={`All trades (${trades.length})`}
        onEdit={(t) => setEditingTrade(t)}
        onDelete={handleDelete}
      />
      {editingTrade && (
        <AddTradeDialog
          accounts={accounts}
          trade={editingTrade}
          userId={userId}
          onClose={() => setEditingTrade(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  )
}
