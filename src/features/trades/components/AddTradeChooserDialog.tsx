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
  onSelectBroker: () => void
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
          <div className={styles.optionDesc}>Bulk-import trades from a FundedNext export file.</div>
        </button>

        <button className={styles.option} onClick={onSelectBroker}>
          <div className={styles.optionHeader}>
            <span className={styles.optionTitle}>Connect a broker</span>
            <span className={styles.badge}>SET UP</span>
          </div>
          <div className={styles.optionDesc}>Auto-sync trades directly from Tradovate, Rithmic, or your broker of choice.</div>
        </button>
      </div>
    </Modal>
  )
}
