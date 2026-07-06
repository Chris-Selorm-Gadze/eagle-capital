import { TileShell } from '../../../shared/ui/TileShell'
import styles from './AvgWinLossBarTile.module.css'

export function AvgWinLossBarTile({
  label,
  info,
  ratio,
  avgWin,
  avgLoss,
}: {
  label: string
  info?: string
  ratio: string
  avgWin: number
  avgLoss: number
}) {
  const winMag = Math.abs(avgWin)
  const lossMag = Math.abs(avgLoss)
  const total = winMag + lossMag
  const winFlex = total > 0 ? winMag : 1
  const lossFlex = total > 0 ? lossMag : 1

  return (
    <TileShell label={label} info={info}>
      <div className={styles.value}>{ratio}</div>
      <div className={styles.bar}>
        <div className={styles.barWin} style={{ flex: winFlex }} />
        <div className={styles.barLoss} style={{ flex: lossFlex }} />
      </div>
      <div className={styles.labels}>
        <span className={styles.winLabel}>${Math.round(winMag).toLocaleString()}</span>
        <span className={styles.lossLabel}>-${Math.round(lossMag).toLocaleString()}</span>
      </div>
    </TileShell>
  )
}
