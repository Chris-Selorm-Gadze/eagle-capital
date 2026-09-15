import { useCallback, useEffect, useState } from 'react'

/** Keeps a page's sub-tab in the URL as `?tab=…`.
 *
 * Sub-tabs used to be plain component state, which meant three things a user
 * reasonably expects all failed: you couldn't link someone to your Rules, the
 * browser's Back button skipped past the whole page instead of stepping back a
 * tab, and leaving and returning always dumped you on the first tab.
 *
 * pushState (not replaceState) is deliberate — a tab change is a place you can
 * go back from. The app's own router reads `nav` out of history state, so the
 * key is carried along to keep it pointing at the same page.
 */
export function useUrlTab<T extends string>(tabs: readonly T[], fallback: T, navKey: string): [T, (tab: T) => void] {
  const read = useCallback((): T => {
    const value = new URLSearchParams(window.location.search).get('tab')
    return tabs.includes(value as T) ? (value as T) : fallback
  }, [tabs, fallback])

  const [tab, setTabState] = useState<T>(read)

  const setTab = useCallback(
    (next: T) => {
      setTabState(next)
      const url = new URL(window.location.href)
      if (next === fallback) url.searchParams.delete('tab')
      else url.searchParams.set('tab', next)
      if (url.toString() !== window.location.href) {
        window.history.pushState({ nav: navKey, tab: next }, '', url)
      }
    },
    [fallback, navKey],
  )

  useEffect(() => {
    function onPopState() {
      setTabState(read())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [read])

  return [tab, setTab]
}
