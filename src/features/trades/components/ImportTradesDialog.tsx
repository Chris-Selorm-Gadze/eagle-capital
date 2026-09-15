import { useMemo, useState } from 'react'
import type { Account } from '../../../db/schema'
import { importTrades } from '../../../db/trades'
import { parseTradeCsv, type CsvParseResult, type DateOrder } from '../csvImport'
import { Modal } from '../../../shared/ui/Modal'
import { AddAccountDialog } from '../../accounts/components/AddAccountDialog'
import styles from './ImportTradesDialog.module.css'
import { errorMessage } from '../../../utils/errors'

/* Offsets the broker's own clock might be on. MT4/MT5 servers are usually
 * GMT+2/+3; the exported timestamps carry no zone marker at all, so without
 * being told, an importer can only guess — and guessing wrong shifts fills
 * across day boundaries. */
const OFFSET_OPTIONS: { label: string; minutes: number }[] = [
  { label: 'UTC (GMT+0)', minutes: 0 },
  { label: 'GMT+1', minutes: 60 },
  { label: 'GMT+2 — common MT4/MT5 (winter)', minutes: 120 },
  { label: 'GMT+3 — common MT4/MT5 (summer)', minutes: 180 },
  { label: 'GMT+4', minutes: 240 },
  { label: 'GMT-4 — US Eastern (summer)', minutes: -240 },
  { label: 'GMT-5 — US Eastern (winter)', minutes: -300 },
  { label: 'GMT-6 — US Central (summer)', minutes: -360 },
  { label: 'GMT-7', minutes: -420 },
  { label: 'GMT-8', minutes: -480 },
]

/** Sentinel for "read the file in whatever zone this computer is in", which is
 * what the importer did before it could be told otherwise. */
const LOCAL = 'local'

function localOffsetLabel(): string {
  const mins = -new Date().getTimezoneOffset()
  const sign = mins >= 0 ? '+' : '-'
  const abs = Math.abs(mins)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `This computer's time zone (GMT${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''})`
}

export function ImportTradesDialog({
  accounts,
  userId,
  onClose,
  onSaved,
  onAccountAdded,
}: {
  accounts: Account[]
  userId: string
  onClose: () => void
  onSaved: () => void
  // Refetches the parent's account list — needed so an account added inline via "+ Add account"
  // below actually shows up as a selectable option (mirrors AddTradeDialog's same prop).
  onAccountAdded?: () => void
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [addingAccount, setAddingAccount] = useState(false)
  const [fileName, setFileName] = useState('')
  const [csvText, setCsvText] = useState<string | null>(null)
  const [dateOrder, setDateOrder] = useState<DateOrder | ''>('')
  const [offset, setOffset] = useState<string>(LOCAL)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [showAllRejects, setShowAllRejects] = useState(false)

  const offsetMinutes = offset === LOCAL ? undefined : Number(offset)

  // Re-parsed whenever the file or either interpretation control changes, so the
  // preview always reflects exactly what Import would write.
  const parsed: CsvParseResult | null = useMemo(() => {
    if (csvText === null) return null
    try {
      return parseTradeCsv(csvText, {
        dateOrder: dateOrder === '' ? undefined : dateOrder,
        brokerUtcOffsetMinutes: offsetMinutes,
      })
    } catch {
      return null
    }
  }, [csvText, dateOrder, offsetMinutes])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    setError('')
    setDateOrder('')
    setShowAllRejects(false)
    setFileName(file.name)
    try {
      setCsvText(await file.text())
    } catch (err) {
      setCsvText(null)
      setError(errorMessage(err))
    }
  }

  // An ambiguous file must not be imported on a guess — "03/04/2026" is either
  // 3 April or 4 March, and the difference silently misfiles a month of trades.
  const needsDateChoice = Boolean(parsed?.dateOrderAmbiguous)
  const canImport =
    parsed !== null &&
    parsed.trades.length > 0 &&
    !parsed.dateOrderConflict &&
    !needsDateChoice &&
    Boolean(accountId) &&
    !importing

  async function doImport() {
    if (!parsed || !accountId) return
    setError('')
    setImporting(true)
    try {
      const res = await importTrades(userId, accountId, parsed.trades)
      setResult(res)
      setCsvText(null)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  const netPreview = parsed ? parsed.trades.reduce((sum, t) => sum + t.pnl, 0) : 0
  const rejects = parsed?.rejected ?? []
  const shownRejects = showAllRejects ? rejects : rejects.slice(0, 5)

  return (
    <Modal
      title="Import trades (CSV)"
      onClose={onClose}
      dirty={parsed !== null && result === null && !importing}
      minWidth={480}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button className="btn-primary" onClick={doImport} disabled={!canImport}>
              {importing ? 'Importing…' : `Import${parsed ? ` ${parsed.trades.length} trade${parsed.trades.length === 1 ? '' : 's'}` : ''}`}
            </button>
          )}
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
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.length === 0 && <option value="">No accounts yet</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
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

      <label className="field">
        CSV file (trade-history export from MT4/MT5 or a similarly-formatted broker/platform)
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
      </label>

      {parsed && !result && (
        <>
          <label className="field">
            Broker server time zone
            <select value={offset} onChange={(e) => setOffset(e.target.value)}>
              <option value={LOCAL}>{localOffsetLabel()}</option>
              {OFFSET_OPTIONS.map((o) => (
                <option key={o.minutes} value={String(o.minutes)}>{o.label}</option>
              ))}
            </select>
          </label>
          <p className={styles.hint}>
            Broker exports carry no time zone. Pick the one your platform's clock runs on, or
            times — and the day each trade lands on — will be off.
          </p>

          {parsed.dateOrderConflict && (
            <div className={`${styles.message} ${styles.error}`}>
              This file contains dates in both <strong>DD/MM/YYYY</strong> and{' '}
              <strong>MM/DD/YYYY</strong> form, so it can't be read reliably. Re-export it with
              an unambiguous date format (ideally YYYY-MM-DD).
            </div>
          )}

          {needsDateChoice && (
            <div className={styles.choiceBlock}>
              <div className={styles.choiceTitle}>Which date format is this file in?</div>
              <p className={styles.hint}>
                Every date in it could be read either way (nothing above the 12th), so we can't
                tell. Choosing wrong silently moves trades to the wrong day.
              </p>
              <div className={styles.choiceRow}>
                <label className={styles.choice}>
                  <input
                    type="radio"
                    name="dateOrder"
                    checked={dateOrder === 'dmy'}
                    onChange={() => setDateOrder('dmy')}
                  />
                  Day first — DD/MM/YYYY
                </label>
                <label className={styles.choice}>
                  <input
                    type="radio"
                    name="dateOrder"
                    checked={dateOrder === 'mdy'}
                    onChange={() => setDateOrder('mdy')}
                  />
                  Month first — MM/DD/YYYY
                </label>
              </div>
            </div>
          )}

          {!parsed.dateOrderConflict && (
            <div className={styles.message} style={{ color: 'var(--text-secondary)' }}>
              Parsed <strong>{parsed.trades.length}</strong> trade{parsed.trades.length === 1 ? '' : 's'} from {fileName}.
              {parsed.provenDateOrder && (
                <> Dates read as{' '}
                  <strong>{parsed.provenDateOrder === 'dmy' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}</strong>
                  {' '}(detected from the file).</>
              )}
              {parsed.trades.length > 0 && (
                <>
                  {' '}Net P&amp;L:{' '}
                  <strong style={{ color: netPreview >= 0 ? 'var(--good)' : 'var(--critical)' }}>
                    {netPreview >= 0 ? '+' : '-'}${Math.abs(netPreview).toLocaleString()}
                  </strong>
                </>
              )}
            </div>
          )}

          {/* Rows used to be counted and discarded with no explanation. A silent
              skip on a trading import hides missing history. */}
          {rejects.length > 0 && (
            <div className={styles.rejects}>
              <div className={styles.rejectsTitle}>
                {rejects.length} row{rejects.length === 1 ? '' : 's'} skipped
              </div>
              <ul className={styles.rejectList}>
                {shownRejects.map((r) => (
                  <li key={r.row}>Row {r.row}: {r.reason}</li>
                ))}
              </ul>
              {rejects.length > shownRejects.length && (
                <button className="btn-ghost" type="button" onClick={() => setShowAllRejects(true)}>
                  Show all {rejects.length}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {error && <div className={`${styles.message} ${styles.error}`}>{error}</div>}

      {result && (
        <div className={styles.message} style={{ color: 'var(--good)' }}>
          Imported {result.imported} new trade{result.imported === 1 ? '' : 's'}
          {result.skipped > 0 && <> ({result.skipped} already imported, skipped)</>}.
        </div>
      )}
    </Modal>
  )
}
