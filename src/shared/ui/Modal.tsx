import type { ReactNode } from 'react'
import styles from './Modal.module.css'

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
