import { useEffect, useState } from 'react'
import type { Account, Trade } from '../../../db/schema'
import { addTrade, updateTrade } from '../../../db/trades'
import { Modal } from '../../../shared/ui/Modal'
import { AddAccountDialog } from '../../accounts/components/AddAccountDialog'

function toLocalInput(date: Date): string {
  const d = new Date(date)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function AddTradeDialog({
  accounts,
  trade,
  userId,
  onClose,
  onSaved,
  onAccountAdded,
}: {
  accounts: Account[]
  trade?: Trade
  userId: string
  onClose: () => void
  onSaved: () => void
  // Refetches the parent's account list — needed so an account added inline via "+ Add account"
  // below actually shows up as a selectable option (this dialog only ever gets whatever
  // `accounts` its parent passes down, it can't refresh that list itself).
  onAccountAdded?: () => void
}) {
  const [accountId, setAccountId] = useState(trade?.accountId ?? accounts[0]?.id ?? '')
  const [addingAccount, setAddingAccount] = useState(false)
  const [symbol, setSymbol] = useState(trade?.symbol ?? '')
  const [side, setSide] = useState<'long' | 'short'>(trade?.side ?? 'long')
  const [qty, setQty] = useState(String(trade?.qty ?? 1))
  const [entryPrice, setEntryPrice] = useState(trade ? String(trade.entryPrice) : '')
  const [exitPrice, setExitPrice] = useState(trade ? String(trade.exitPrice) : '')
  const [entryTime, setEntryTime] = useState(toLocalInput(trade ? new Date(trade.entryTime) : new Date()))
  const [exitTime, setExitTime] = useState(toLocalInput(trade ? new Date(trade.exitTime) : new Date()))
  const [fees, setFees] = useState(trade?.fees !== undefined ? String(trade.fees) : '')
  const [notes, setNotes] = useState(trade?.notes ?? '')
  // Prefilled from the trade's real P&L when editing, so saving a notes/fees tweak can't
  // silently recompute and corrupt an authoritative (e.g. CSV-imported) value — see pnlOverride
  // in db/trades.ts. Auto-synced from price × qty for brand-new trades until the user overrides
  // it, since the naive price-diff formula only holds for $1/point/unit instruments (not true
  // for e.g. index CFDs or futures with a real contract multiplier).
  const [pnl, setPnl] = useState(trade ? String(trade.pnl) : '')
  const [pnlTouched, setPnlTouched] = useState(!!trade)

  const naivePnl =
    entryPrice === '' || exitPrice === '' || qty === ''
      ? null
      : (Number(exitPrice) - Number(entryPrice)) * Number(qty) * (side === 'long' ? 1 : -1) - (fees === '' ? 0 : Number(fees))

  useEffect(() => {
    if (pnlTouched || naivePnl === null) return
    setPnl(String(naivePnl))
  }, [naivePnl, pnlTouched])

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
    const pnlOverride = pnl === '' ? undefined : Number(pnl)
    if (trade) await updateTrade(trade.id!, input, pnlOverride)
    else await addTrade(userId, input, pnlOverride)
    onSaved()
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
      {/* Plain div, not <label> — a <label> wrapping both the button and the select would make
          the browser forward any click on the label's empty space to the first labelable
          descendant (the button, since it comes before the select in the DOM), opening Add
          account without the button itself being clicked. */}
      <div className="field">
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Account
          <button type="button" className="btn-primary" style={{ marginTop: 0 }} onClick={() => setAddingAccount(true)}>
            + Add account
          </button>
        </span>
        {accounts.length === 0 ? (
          <p style={{ marginTop: '0.35rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            No accounts yet — add one to log a trade against.
          </p>
        ) : (
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        )}
      </div>

      {addingAccount && (
        <AddAccountDialog
          userId={userId}
          onClose={() => setAddingAccount(false)}
          onSaved={(newAccountId) => {
            setAddingAccount(false)
            onAccountAdded?.()
            if (newAccountId) setAccountId(newAccountId)
          }}
        />
      )}

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
        P&amp;L
        <input
          type="number"
          value={pnl}
          onChange={(e) => { setPnl(e.target.value); setPnlTouched(true) }}
        />
      </label>
      <p style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        Auto-filled from price × qty (assumes $1 per point per unit) — type the real amount if this
        instrument has a different contract multiplier, or if you're correcting a broker-reported value.
      </p>

      <label className="field">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </Modal>
  )
}
