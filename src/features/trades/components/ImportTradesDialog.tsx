import { useState } from 'react'
import type { Account } from '../../../db/schema'
import { importTrades } from '../../../db/trades'
import { parseTradeCsv, type ParsedTrade } from '../csvImport'
import { Modal } from '../../../shared/ui/Modal'
import styles from './ImportTradesDialog.module.css'
import { errorMessage } from '../../../utils/errors'

export function ImportTradesDialog({
  accounts,
  userId,
  onClose,
  onSaved,
}: {
  accounts: Account[]
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedTrade[] | null>(null)
  const [skippedRows, setSkippedRows] = useState(0)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    setError('')
    setFileName(file.name)
    try {
      const text = await file.text()
      const { trades, skippedRows } = parseTradeCsv(text)
      if (trades.length === 0) throw new Error('No recognizable trade rows found in this file.')
      setParsed(trades)
      setSkippedRows(skippedRows)
    } catch (err) {
      setParsed(null)
      setError(errorMessage(err))
    }
  }

  async function doImport() {
    if (!parsed || !accountId) return
    setError('')
    setImporting(true)
    try {
      const res = await importTrades(userId, accountId, parsed)
      setResult(res)
      setParsed(null)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  const netPreview = parsed ? parsed.reduce((sum, t) => sum + t.pnl, 0) : 0

  return (
    <Modal
      title="Import trades (CSV)"
      onClose={onClose}
      minWidth={420}
      footer={
        <>
          <button onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button onClick={doImport} disabled={!parsed || !accountId || importing}>
              {importing ? 'Importing…' : `Import${parsed ? ` ${parsed.length} trades` : ''}`}
            </button>
          )}
        </>
      }
    >
      <label className="field">
        Account
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.length === 0 && <option value="">No accounts yet</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </label>

      <label className="field">
        CSV file (trade-history export from MT4/MT5 or a similarly-formatted broker/platform)
        <input type="file" accept=".csv" onChange={onFile} />
      </label>

      {fileName && !error && (
        <div className={styles.message} style={{ color: 'var(--text-secondary)' }}>
          {parsed
            ? <>Parsed <strong>{parsed.length}</strong> trades from {fileName}
                {skippedRows > 0 && <> ({skippedRows} row{skippedRows === 1 ? '' : 's'} skipped — unrecognized format)</>}.
                {' '}Net P&amp;L: <strong style={{ color: netPreview >= 0 ? 'var(--good)' : 'var(--critical)' }}>
                  {netPreview >= 0 ? '+' : '-'}${Math.abs(netPreview).toLocaleString()}
                </strong>
              </>
            : `Loaded ${fileName}.`}
        </div>
      )}

      {error && (
        <div className={styles.message} style={{ color: 'var(--critical)' }}>{error}</div>
      )}

      {result && (
        <div className={styles.message} style={{ color: 'var(--good)' }}>
          Imported {result.imported} new trade{result.imported === 1 ? '' : 's'}
          {result.skipped > 0 && <> ({result.skipped} already imported, skipped)</>}.
        </div>
      )}
    </Modal>
  )
}
