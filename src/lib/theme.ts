/* Light/dark for the whole product.
 *
 * index.css has shipped a complete `.dark` token set since the shadcn install
 * and theme.css now has a matching one for the CSS-Module pages, but nothing
 * ever applied the class: app-shell-5's own `theme-switcher.tsx` was left out of
 * the install, and it depends on `next-themes`.
 *
 * This is that file's job without the dependency. `next-themes` exists to solve
 * server rendering — it has to reconcile a server-rendered tree with a
 * client-only preference. This app is a Vite SPA with no server render at all,
 * so the whole problem it solves doesn't arise, and 14kB to toggle one class on
 * <html> isn't a trade worth making.
 *
 * Three states, not two. "system" is the default and it keeps FOLLOWING the OS
 * — a binary toggle looks identical on first load but silently stops tracking
 * the setting the moment the user touches it, which is how apps end up light at
 * midnight.
 */

export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'eaglecapital-theme'

/** Matches theme.css's `.dark` selector and index.css's
 * `@custom-variant dark (&:is(.dark *))` — one class drives both systems. */
const DARK_CLASS = 'dark'

/** The browser UI colour (Android address bar, PWA chrome). Left at a single
 * light value it framed a dark app in a near-white bar. */
const THEME_COLOR = { light: '#faf9f7', dark: '#0a0a0a' } as const

const DARK_QUERY = '(prefers-color-scheme: dark)'

function isChoice(v: unknown): v is ThemeChoice {
  return v === 'light' || v === 'dark' || v === 'system'
}

/** Storage throws rather than returning null in a locked-down context (Safari
 * private browsing, third-party-cookie blocking, an embedded webview). Every
 * read and write here is guarded, and the failure mode is "follow the OS",
 * which is the right answer anyway. */
export function readChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return isChoice(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

function writeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    /* Preference won't survive the reload. The theme still applies for this
       session, which is what the user just asked for. */
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return choice
}

/** Toggles the one class both token systems hang off, and keeps the browser
 * chrome colour in step. Safe to call repeatedly — it's idempotent. */
export function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle(DARK_CLASS, resolved === 'dark')

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = THEME_COLOR[resolved]
}

const listeners = new Set<() => void>()

function notify() {
  for (const fn of listeners) fn()
}

export function setThemeChoice(choice: ThemeChoice) {
  writeChoice(choice)
  applyTheme(resolveTheme(choice))
  notify()
}

/** Subscribes to any change in the RESOLVED theme — an explicit choice here, or
 * the OS setting moving while the choice is "system". Returns an unsubscribe. */
export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange)

  const mq = window.matchMedia(DARK_QUERY)
  function handleSystemChange() {
    // Only relevant while we're following the OS. Re-applied rather than just
    // announced, so the class is correct even if nothing is subscribed.
    if (readChoice() !== 'system') return
    applyTheme(resolveTheme('system'))
    notify()
  }
  mq.addEventListener('change', handleSystemChange)

  return () => {
    listeners.delete(onChange)
    mq.removeEventListener('change', handleSystemChange)
  }
}

/** Called once from main.tsx. index.html applies the class before first paint to
 * avoid a flash; this re-runs it so the two can never disagree, and starts the
 * OS listener for the "system" case. */
export function initTheme() {
  applyTheme(resolveTheme(readChoice()))
  subscribeTheme(() => {})
}
