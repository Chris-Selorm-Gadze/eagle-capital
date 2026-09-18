import { Modal } from '../../../shared/ui/Modal'
import styles from './AddTradeChooserDialog.module.css'

export function AddTradeChooserDialog({
  onSelectManual,
  onSelectImport,
  onSelectBroker,
  onClose,
}: {
  onSelectManual: () => void
  onSelectImport: () => void
  /** Omitted while the broker-sync service is parked. The option promised
   *  auto-syncing trades from a broker, which is precisely what that service
   *  did -- offering it anyway sends someone hunting for a setting that cannot
   *  exist, in the one dialog they open to get trades onto the dashboard. */
  onSelectBroker?: () => void
  onClose: () => void
}) {
  return (
    <Modal title="Add trades" onClose={onClose} minWidth={380} footer={<button onClick={onClose}>Cancel</button>}>
      <div className={styles.options}>
        <button className={styles.option} onClick={onSelectManual}>
          <div className={styles.optionTitle}>Enter manually</div>
          <div className={styles.optionDesc}>Log a single trade by hand.</div>
        </button>

        <button className={styles.option} onClick={onSelectImport}>
          <div className={styles.optionTitle}>Import CSV</div>
          <div className={styles.optionDesc}>Bulk-import trades from a broker CSV export.</div>
        </button>

        {onSelectBroker && (
          <button className={styles.option} onClick={onSelectBroker}>
            <div className={styles.optionHeader}>
              <span className={styles.optionTitle}>Connect a broker</span>
              <span className={styles.badge}>SET UP</span>
            </div>
            <div className={styles.optionDesc}>Auto-sync trades directly from Tradovate, Rithmic, or your broker of choice.</div>
          </button>
        )}
      </div>
    </Modal>
  )
}
