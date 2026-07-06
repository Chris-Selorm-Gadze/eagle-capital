// Shared recharts styling — was copy-pasted across every chart component.
// Recharts/SVG presentation props resolve var() fine at render time (confirmed
// by the gauge/pie tiles already using `fill="var(--good)"`), so these point
// straight at theme.css's custom properties — one source of truth, no drift.
// A couple of true chart-only shades with no equivalent UI token are their
// own literals instead.

export const COLOR_GOOD = 'var(--good)'
export const COLOR_CRITICAL = 'var(--critical)'
export const COLOR_ACCENT = 'var(--accent)'
export const COLOR_GRIDLINE = 'var(--gridline)'

// Brighter variants for text drawn over a tinted fill (e.g. calendar cells) —
// no equivalent root token, chart-specific.
export const COLOR_GOOD_LIGHT = '#4ee44e'
export const COLOR_CRITICAL_LIGHT = '#ff8080'

// Axis line/tick color with no existing UI token — never appears outside charts.
const AXIS_LINE_COLOR = '#383835'

export const AXIS_TICK_STYLE = { fontSize: 11, fill: 'var(--text-muted)' }
export const AXIS_LINE_STYLE = { stroke: AXIS_LINE_COLOR }

export const TOOLTIP_CONTENT_STYLE = { background: 'var(--surface-2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }
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
