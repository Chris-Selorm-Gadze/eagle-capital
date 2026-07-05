import { TileShell } from './TileShell'

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
      <div style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '0.15rem', color: color ?? 'var(--text-primary)' }}>{value}</div>
    </TileShell>
  )
}
