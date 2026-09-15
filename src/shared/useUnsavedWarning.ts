import { useEffect } from 'react'

/** Warns before a refresh, tab close or back-navigation would discard unsaved
 * input. The report card in particular is the longest-form page in the app —
 * five Whys, a ledger, a full scoreboard — and a stray Cmd+R used to take all
 * of it with no prompt.
 *
 * Browsers show their own generic wording here; the returned string is ignored
 * by every current engine, but assigning it is still what arms the prompt. */
export function useUnsavedWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])
}
