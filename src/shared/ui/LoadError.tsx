import styles from './LoadError.module.css'

/* Shown when a page's data failed to load.
 *
 * Every top-level load in this app used to be `load().finally(() => setLoading(false))`
 * with no catch, so a dropped connection or an RLS error produced an empty array and the
 * page rendered its "nothing here yet" state. For a trading journal that's the worst
 * possible failure mode: it tells someone their records are gone when they aren't.
 */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={`card ${styles.root}`} role="alert">
      <div className={styles.title}>Couldn’t load your data</div>
      <p className={styles.message}>{message}</p>
      <p className={styles.reassure}>
        Nothing has been changed or lost — this is a problem reading it, not a problem with
        the data itself.
      </p>
      {onRetry && (
        <button className="btn-primary" onClick={onRetry} type="button">
          Try again
        </button>
      )}
    </div>
  )
}
