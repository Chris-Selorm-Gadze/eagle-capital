import type { KeyboardEvent } from 'react'

/* Makes a non-button element behave like one.
 *
 * Rows, cards and calendar cells across this app carried an onClick and nothing
 * else: reachable with a mouse, invisible to the keyboard. A trader scanning a
 * day's trades could not tab to one and open it, and neither could a screen
 * reader announce that the row did anything at all.
 *
 * A real <button> is the right answer where one fits, but these elements carry
 * grid and border-left layout that a button's own box model fights, and
 * rewriting seven layouts to win that argument is a worse trade than giving the
 * element the three things a button actually provides: a name for assistive
 * tech, a place in the tab order, and Enter/Space.
 *
 * Space is preventDefault'd because its default action scrolls the page, which
 * on a long list moves the thing the user just activated out of view.
 */
export function activate(handler: () => void, enabled = true) {
  if (!enabled) return {}
  return {
    role: 'button',
    tabIndex: 0,
    onClick: handler,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      handler()
    },
  } as const
}

/** Which item a roving-tabindex list should move to for a given key.
 *
 * A list of two hundred trades with tabIndex=0 on every row puts two hundred
 * stops between the list and whatever follows it. The pattern assistive tech
 * expects instead is one stop for the whole list, with arrows moving inside it.
 *
 * Returns null when the key is not a navigation key, so the caller can leave
 * the event alone rather than swallowing typing.
 */
export function rovingIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowDown': return Math.min(current + 1, count - 1)
    case 'ArrowUp': return Math.max(current - 1, 0)
    case 'Home': return 0
    case 'End': return count - 1
    default: return null
  }
}
