// Shared recharts styling — was copy-pasted across every chart component.
// Recharts/SVG presentation props resolve var() fine at render time (confirmed
// by the gauge/pie tiles already using `fill="var(--good)"`), so these point
// straight at theme.css's custom properties — one source of truth, no drift.
// A couple of true chart-only shades with no equivalent UI token are their
// own literals instead.

export const COLOR_GOOD = 'var(--good)'
export const COLOR_CRITICAL = 'var(--critical)'
export const COLOR_ACCENT = 'var(--data-accent)'
export const COLOR_GRIDLINE = 'var(--gridline)'

// Text drawn OVER a tinted fill (e.g. a calendar cell, a P&L pill). These were
// literals here, which put them out of reach of CSS — so LivePositionsPage
// hardcoded its own near-miss pair rather than share them. They are tokens in
// theme.css now, which also means they flip correctly under `.dark`: on a light
// ground the text moves darker than the fill, on a dark ground lighter.
export const COLOR_GOOD_LIGHT = 'var(--good-deep)'
export const COLOR_CRITICAL_LIGHT = 'var(--critical-deep)'

export const AXIS_TICK_STYLE = { fontSize: 11, fill: 'var(--text-muted)' }
// Was a #d4d4d4 literal, which stayed light-grey on the dark ground and drew a
// brighter axis than the data. --gridline already means exactly this and now has
// a dark value.
export const AXIS_LINE_STYLE = { stroke: 'var(--gridline)' }

export const TOOLTIP_CONTENT_STYLE = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  // color-mix rather than a literal rgba: a shadow tuned for white is invisible
  // on a 0.145 ground, and one tuned for dark is a smear on white.
  boxShadow: '0 4px 16px -8px color-mix(in srgb, var(--text-primary) 28%, transparent)',
}
export const TOOLTIP_LABEL_STYLE = { color: 'var(--text-secondary)' }
export const TOOLTIP_ITEM_STYLE = { color: 'var(--text-primary)' }

// Categorical identity colors (e.g. one per firm) — fixed order, never cycled/reassigned
// per-render. Dark-mode-safe hues, distinct from the good/critical/accent status colors above.
export const CATEGORICAL_COLORS = [
  '#3987e5', // blue
  '#199e70', // aqua
  '#c98500', // yellow
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
  '#d55181', // magenta
  '#d95926', // orange
]
