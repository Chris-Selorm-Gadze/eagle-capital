import { TileShell } from './TileShell'

/** One figure, with its label. `color` is for the semantic tokens — a P&L figure
 * that should read green or red — and is left unset for a neutral number. */
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
    <TileShell badge={badge} info={info} label={label}>
      <div
        className="mt-0.5 font-semibold text-2xl tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </TileShell>
  )
}
