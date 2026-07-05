import { useRef, useState } from 'react'
import { exportBackup, downloadBackup, parseBackupFile, importBackup } from '../db/backup'

export function BackupControls() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')

  async function handleExport() {
    downloadBackup(await exportBackup())
    setStatus('Backup downloaded.')
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!confirm('This replaces all data currently in the browser with the backup file. Continue?')) return
    try {
      const backup = await parseBackupFile(file)
      await importBackup(backup)
      setStatus(`Restored backup from ${new Date(backup.exportedAt).toLocaleString()}.`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <button onClick={handleExport}>Export backup</button>
      <button onClick={() => fileInput.current?.click()}>Import backup</button>
      <input ref={fileInput} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportFile} />
      {status && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{status}</span>}
    </div>
  )
}
