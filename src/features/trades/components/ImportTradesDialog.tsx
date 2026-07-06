import { useState } from 'react'
import type { Account } from '../../../db/schema'
import { importTrades } from '../../../db/trades'
import { parseFnCsv, type ParsedFnTrade } from '../fnImport'
import { Modal } from '../../../shared/ui/Modal'
import styles from './ImportTradesDialog.module.css'

export function ImportTradesDialog({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const fnAccounts = accounts.filter((a) => a.firm === 'fundednext')
  const [accountId, setAccountId] = useState(fnAccounts[0]?.id ?? 0)
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedFnTrade[] | null>(null)
  const [skippedRows, setSkippedRows] = useState(0)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [error, setError] = useState('')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    setError('')
    setFileName(file.name)
    try {
      const text = await file.text()
      const { trades, skippedRows } = parseFnCsv(text)
      if (trades.length === 0) throw new Error('No recognizable trade rows found in this file.')
      setParsed(trades)
      setSkippedRows(skippedRows)
    } catch (err) {
      setParsed(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function doImport() {
    if (!parsed || !accountId) return
    const res = await importTrades(accountId, parsed)
    setResult(res)
    setParsed(null)
  }

  const netPreview = parsed ? parsed.reduce((sum, t) => sum + t.pnl, 0) : 0

  return (
    <Modal
      title="Import trades (FundedNext CSV)"
      onClose={onClose}
      minWidth={420}
      footer={
        <>
          <button onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button onClick={doImport} disabled={!parsed || !accountId}>
              Import{parsed ? ` ${parsed.length} trades` : ''}
            </button>
          )}
        </>
      }
    >
      <label className="field">
        Account
        <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
          {fnAccounts.length === 0 && <option value={0}>No FundedNext accounts</option>}
          {fnAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </label>

      <label className="field">
        CSV file ("trading-data" or "CLOSED_POSITIONS" export)
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
