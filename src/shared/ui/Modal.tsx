import { useEffect } from 'react'
import type { ReactNode } from 'react'
import styles from './Modal.module.css'

// Counts concurrently-mounted modals rather than blindly setting/clearing overflow — if a second
// Modal ever opens on top of a first one, the first's unmount must not re-enable page scroll
// while the second is still up.
let openModalCount = 0

export function Modal({
  title,
  onClose,
  minWidth = 380,
  footer,
  children,
}: {
  title: string
  onClose: () => void
  minWidth?: number
  footer: ReactNode
  children: ReactNode
}) {
  // The page underneath must not scroll while a modal is up — otherwise the background content
  // keeps moving under what's supposed to be a focused, blocking dialog.
  useEffect(() => {
    openModalCount++
    document.body.style.overflow = 'hidden'
    return () => {
      openModalCount--
      if (openModalCount === 0) document.body.style.overflow = ''
    }
  }, [])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} style={{ minWidth }} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>{title}</h3>
        {children}
        <div className={styles.footer}>{footer}</div>
      </div>
    </div>
  )
}
