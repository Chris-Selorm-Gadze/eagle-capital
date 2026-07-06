import { useState } from 'react'
import type { Account, Trade } from '../../db/schema'
import { deleteTrade } from '../../db/trades'
import { RecentTradesTable } from './components/RecentTradesTable'
import { AddTradeDialog } from './components/AddTradeDialog'

export function TradeLogPage({ trades, accounts }: { trades: Trade[]; accounts: Account[] }) {
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null)

  return (
    <div>
      <RecentTradesTable
        trades={trades}
        title={`All trades (${trades.length})`}
        onEdit={(t) => setEditingTrade(t)}
        onDelete={(id) => deleteTrade(id)}
      />
      {editingTrade && (
        <AddTradeDialog accounts={accounts} trade={editingTrade} onClose={() => setEditingTrade(null)} />
      )}
    </div>
  )
}
