import { useCallback, useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { useOptionalConfirm } from './confirm'
import styles from './Modal.module.css'

/* The app's dialog primitive, used by every legacy CSS-Module form.
 *
 * It previously did one thing — hide page scroll — and nothing else a dialog
 * needs. In particular a click anywhere on the backdrop closed it instantly and
 * silently, so a stray click beside a half-filled Add Trade or Log Session form
 * discarded everything with no warning. It also had no Escape handler, no focus
 * management and no ARIA role, so assistive tech never announced it as a dialog
 * and Tab walked straight out into the page behind it.
 */

/* A stack rather than a counter, because two things depend on knowing which
 * modal is on top, not just how many are open:
 *   · page scroll must stay locked until the LAST one closes;
 *   · Escape must dismiss only the topmost. Several dialogs nest (Add account
 *     opens over Add trade), and every instance listens on `document`, so
 *     without this one keypress would close the whole stack. */
const modalStack: symbol[] = []

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  title,
  onClose,
  minWidth = 380,
  footer,
  children,
  dirty = false,
}: {
  title: string
  onClose: () => void
  minWidth?: number
  footer: ReactNode
  children: ReactNode
  /** Set when the form holds unsaved input. Dismissing by backdrop click or
   * Escape then asks first, instead of throwing the work away. */
  dirty?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const confirm = useOptionalConfirm()

  // The element that had focus before the dialog opened, so it can be handed
  // back on close rather than dumping focus at the top of the document.
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  const requestClose = useCallback(async () => {
    if (!dirty) {
      onClose()
      return
    }
    if (!confirm) {
      onClose()
      return
    }
    const discard = await confirm({
      title: 'Discard your changes?',
      description: 'This form has unsaved input. Closing it now loses what you typed.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      destructive: true,
    })
    if (discard) onClose()
  }, [dirty, onClose, confirm])

  const instanceId = useRef<symbol>(Symbol('modal'))

  useEffect(() => {
    const id = instanceId.current
    modalStack.push(id)
    document.body.style.overflow = 'hidden'
    restoreFocusTo.current = document.activeElement as HTMLElement | null

    // Focus the first real control so keyboard users land inside the dialog.
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    return () => {
      const at = modalStack.indexOf(id)
      if (at !== -1) modalStack.splice(at, 1)
      if (modalStack.length === 0) document.body.style.overflow = ''
      restoreFocusTo.current?.focus?.()
    }
  }, [])

  const isTopmost = () => modalStack[modalStack.length - 1] === instanceId.current

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isTopmost()) return
      // A confirmation (Radix AlertDialog) rendered above this one owns the
      // keyboard while it's up — including the "discard your changes?" prompt
      // this very handler can raise.
      if (document.querySelector('[role="alertdialog"]')) return

      if (e.key === 'Escape') {
        e.stopPropagation()
        void requestClose()
        return
      }
      if (e.key !== 'Tab') return

      // Focus trap: without it Tab leaves the dialog and walks the page behind
      // it, which is still visible and still interactive to the keyboard.
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
        .filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [requestClose])

  return (
    // Escape is handled above, and every action the backdrop offers is also on
    // the close button and in the footer, so it is a pointer shortcut rather
    // than the only way out.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) void requestClose() }}>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.panel}
        ref={panelRef}
        role="dialog"
        style={{ minWidth }}
      >
        <div className={styles.titleRow}>
          <h3 className={styles.title} id={titleId}>{title}</h3>
          <button
            aria-label="Close dialog"
            className={styles.closeButton}
            onClick={() => void requestClose()}
            type="button"
          >
            ×
          </button>
        </div>
        {children}
        <div className={styles.footer}>{footer}</div>
      </div>
    </div>
  )
}
