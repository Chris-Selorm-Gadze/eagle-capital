/* One tooltip row, matching what ChartTooltipContent renders by default.
 *
 * ChartTooltipContent's `formatter` prop replaces the WHOLE row — swatch, label
 * and value — so any chart that needs a formatted value (money, a duration, a
 * clock time) loses the swatch and the label layout too, and each one ends up
 * inventing its own. That is how the dashboard came to have two tooltip designs.
 *
 * This is the markup from chart.tsx's own default branch, factored out so a
 * formatter can reuse it instead of improvising. Keep it in step with that file.
 */
export function ChartTooltipRow({
	color,
	label,
	value,
}: {
	/** The series colour for the swatch. Omit for a row with no series — an
	 * axis reading like "9:30", which isn't one of the plotted series. */
	color?: string
	label: React.ReactNode
	value: React.ReactNode
}) {
	return (
		<>
			{color ? (
				<div
					className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
					style={{ background: color }}
				/>
			) : (
				// Keeps the label column aligned with the rows that do have a swatch.
				<div className="w-2.5 shrink-0" />
			)}
			<div className="flex flex-1 items-center justify-between gap-3 leading-none">
				<span className="text-muted-foreground">{label}</span>
				<span className="font-medium text-foreground tabular-nums">{value}</span>
			</div>
		</>
	)
}
