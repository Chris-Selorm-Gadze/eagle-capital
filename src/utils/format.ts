/** "45 min" under an hour; "1 hr" / "1 hr 5 min" at 60+ minutes. */
export function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const mins = rounded % 60
  return mins === 0 ? `${hours} hr` : `${hours} hr ${mins} min`
}
