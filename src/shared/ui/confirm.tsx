import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

/* Promise-based replacement for window.confirm().
 *
 * The app had 16 native confirm() calls and an alert() — browser chrome in the
 * middle of an otherwise designed product, unstyleable and (on some platforms)
 * suppressible. Keeping the promise shape means each call site stays a
 * one-liner:
 *
 *   if (!(await confirm({ title: 'Delete this rule?' }))) return
 *
 * rather than every page growing its own open/pending/target state. */

export interface ConfirmOptions {
  title: string
  description?: string
  /** Label for the confirming button. Defaults to "Confirm". */
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the action button as destructive. Use for anything that deletes,
   * or that places real orders. */
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  // Held in a ref rather than state: resolving is a side effect of the user's
  // answer, and re-rendering when it's stored would be pointless.
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  function settle(answer: boolean) {
    resolverRef.current?.(answer)
    resolverRef.current = null
    setOptions(null)
  }

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AlertDialog
        onOpenChange={(open) => {
          // Covers Escape and click-outside, which must resolve false rather
          // than leaving the caller awaiting forever.
          if (!open) settle(false)
        }}
        open={options !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title}</AlertDialogTitle>
            {options?.description && (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                options?.destructive
                  ? 'bg-destructive text-white hover:bg-destructive/90'
                  : undefined
              }
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider')
  return ctx
}
