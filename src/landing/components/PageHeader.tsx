import type { ReactNode } from 'react'
import { Reveal } from './Reveal'
import styles from '../pages/shared.module.css'

interface PageHeaderProps {
  eyebrow: string
  title: string
  subhead?: string
  children?: ReactNode
}

export function PageHeader({ eyebrow, title, subhead, children }: PageHeaderProps) {
  return (
    <header className={styles.masthead}>
      <div className="shell">
        <Reveal immediate>
          <div className={`micro ${styles.eyebrow}`}>{eyebrow}</div>
          <h1 className={styles.h1}>{title}</h1>
          {subhead && <p className={styles.subhead}>{subhead}</p>}
          {children}
        </Reveal>
      </div>
    </header>
  )
}
