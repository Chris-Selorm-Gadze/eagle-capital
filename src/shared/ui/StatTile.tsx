import { TileShell } from './TileShell'
import styles from './StatTile.module.css'

export function StatTile({
  label,
  value,
  color,
  info,
  badge,
}: {
  label: string
  value: string
  color?: string
  info?: string
  badge?: string | number
}) {
  return (
    <TileShell label={label} info={info} badge={badge}>
      <div className={styles.value} style={color ? { color } : undefined}>{value}</div>
    </TileShell>
  )
}
