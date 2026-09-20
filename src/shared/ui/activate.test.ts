import { describe, expect, it, vi } from 'vitest'
import { activate, rovingIndex } from './activate'

function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as Parameters<
    NonNullable<ReturnType<typeof activate>['onKeyDown']>
  >[0] & { preventDefault: ReturnType<typeof vi.fn> }
}

describe('activate', () => {
  it('gives a plain element a name, a tab stop and a click', () => {
    const onActivate = vi.fn()
    const props = activate(onActivate)
    expect(props.role).toBe('button')
    expect(props.tabIndex).toBe(0)
    props.onClick?.()
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('activates on Enter and Space', () => {
    const onActivate = vi.fn()
    const props = activate(onActivate)
    props.onKeyDown?.(keyEvent('Enter'))
    props.onKeyDown?.(keyEvent(' '))
    expect(onActivate).toHaveBeenCalledTimes(2)
  })

  it('swallows Space so the page does not scroll out from under the row', () => {
    const event = keyEvent(' ')
    activate(vi.fn()).onKeyDown?.(event)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('leaves every other key alone', () => {
    const onActivate = vi.fn()
    const event = keyEvent('a')
    activate(onActivate).onKeyDown?.(event)
    expect(onActivate).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('adds nothing when the element is not actually clickable', () => {
    // A calendar cell for a day with no trades does nothing when clicked, so
    // putting it in the tab order would be a stop that leads nowhere.
    expect(activate(vi.fn(), false)).toEqual({})
  })
})

describe('rovingIndex', () => {
  it('moves one row at a time', () => {
    expect(rovingIndex('ArrowDown', 0, 5)).toBe(1)
    expect(rovingIndex('ArrowUp', 3, 5)).toBe(2)
  })

  it('stops at the ends rather than wrapping', () => {
    // Wrapping from the last trade back to the first reads as a jump to
    // somewhere else, not as the end of the list.
    expect(rovingIndex('ArrowDown', 4, 5)).toBe(4)
    expect(rovingIndex('ArrowUp', 0, 5)).toBe(0)
  })

  it('jumps to either end', () => {
    expect(rovingIndex('Home', 3, 5)).toBe(0)
    expect(rovingIndex('End', 1, 5)).toBe(4)
  })

  it('ignores keys that are not navigation, so typing still works', () => {
    expect(rovingIndex('a', 0, 5)).toBeNull()
    expect(rovingIndex('Enter', 0, 5)).toBeNull()
  })

  it('does nothing on an empty list', () => {
    expect(rovingIndex('ArrowDown', 0, 0)).toBeNull()
  })
})
