import { Link } from './Link'
import styles from '../pages/shared.module.css'

/** Closing action shared by every inner page. `note` is optional context that
 * sits beside the button rather than under it. */
export function PageCta({ label, to = '/signup', note }: { label: string; to?: string; note?: string }) {
  return (
    <div className={styles.cta}>
      <Link to={to} className="btnInk">{label}</Link>
      {note && <span className={styles.ctaNote}>{note}</span>}
    </div>
  )
}
