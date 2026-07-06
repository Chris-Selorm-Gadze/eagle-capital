import { useState } from 'react'
import type { Account, Trade } from '../../../db/schema'
import { addTrade, updateTrade } from '../../../db/trades'
import { Modal } from '../../../shared/ui/Modal'

function toLocalInput(date: Date): string {
  const d = new Date(date)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function AddTradeDialog({ accounts, trade, onClose }: { accounts: Account[]; trade?: Trade; onClose: () => void }) {
  const [accountId, setAccountId] = useState(trade?.accountId ?? accounts[0]?.id ?? 0)
  const [symbol, setSymbol] = useState(trade?.symbol ?? '')
  const [side, setSide] = useState<'long' | 'short'>(trade?.side ?? 'long')
  const [qty, setQty] = useState(String(trade?.qty ?? 1))
  const [entryPrice, setEntryPrice] = useState(trade ? String(trade.entryPrice) : '')
  const [exitPrice, setExitPrice] = useState(trade ? String(trade.exitPrice) : '')
  const [entryTime, setEntryTime] = useState(toLocalInput(trade ? new Date(trade.entryTime) : new Date()))
  const [exitTime, setExitTime] = useState(toLocalInput(trade ? new Date(trade.exitTime) : new Date()))
  const [fees, setFees] = useState(trade?.fees !== undefined ? String(trade.fees) : '')
  const [notes, setNotes] = useState(trade?.notes ?? '')

  const canSave = accountId && symbol && entryPrice !== '' && exitPrice !== '' && entryTime && exitTime

  async function save() {
    const input = {
      accountId,
      symbol: symbol.toUpperCase(),
      side,
      qty: Number(qty),
      entryPrice: Number(entryPrice),
      exitPrice: Number(exitPrice),
      entryTime: new Date(entryTime).toISOString(),
      exitTime: new Date(exitTime).toISOString(),
      fees: fees === '' ? undefined : Number(fees),
      notes: notes || undefined,
    }
    if (trade) await updateTrade(trade.id!, input)
    else await addTrade(input)
    onClose()
  }

  return (
    <Modal
      title={trade ? 'Edit trade' : 'Add trade'}
      onClose={onClose}
      minWidth={420}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={save} disabled={!canSave}>{trade ? 'Update' : 'Save'}</button>
        </>
      }
    >
      <label className="field">
        Account
        <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </label>

      <div className="field-row">
        <label className="flex-2">
          Symbol
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="MES" />
        </label>
        <label className="flex-1">
          Side
          <select value={side} onChange={(e) => setSide(e.target.value as 'long' | 'short')}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </label>
        <label className="flex-1">
          Qty
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
      </div>

      <div className="field-row">
        <label className="flex-1">
          Entry price
          <input type="number" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} />
        </label>
        <label className="flex-1">
          Exit price
          <input type="number" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} />
        </label>
      </div>

      <div className="field-row">
        <label className="flex-1">
          Entry time
          <input type="datetime-local" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} />
        </label>
        <label className="flex-1">
          Exit time
          <input type="datetime-local" value={exitTime} onChange={(e) => setExitTime(e.target.value)} />
        </label>
      </div>

      <label className="field">
        Fees (optional)
        <input type="number" value={fees} onChange={(e) => setFees(e.target.value)} />
      </label>

      <label className="field">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </Modal>
  )
}
