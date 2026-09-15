import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  cancelAccountDeletion, daysUntilPurge, getDeletionRequest, type DeletionRequest,
} from '../../db/accountDeletion'
import { errorMessage } from '../../utils/errors'

/* Shown on every page while an account is scheduled for deletion.
 *
 * The window is only useful if the user actually finds out they're inside it.
 * Burying "cancel deletion" in Settings would mean someone who changed their
 * mind, signed back in, and saw their dashboard looking normal would have no
 * idea a clock was running.
 */
export function DeletionBanner({ userId }: { userId: string }) {
  const [request, setRequest] = useState<DeletionRequest | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(() => {
    getDeletionRequest()
      .then(setRequest)
      .catch(() => {
        /* A banner that can't load is silent rather than alarming. Settings
           shows the same state and reports its own errors. */
      })
  }, [])

  useEffect(load, [load])

  async function cancel() {
    setCancelling(true)
    try {
      await cancelAccountDeletion(userId)
      setRequest(null)
      toast.success('Deletion cancelled. Nothing was removed.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setCancelling(false)
    }
  }

  if (!request) return null

  const days = daysUntilPurge(request.purgeAfter)
  const when = new Date(request.purgeAfter).toLocaleDateString(undefined, {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="text-sm">
        <div className="font-medium text-destructive">
          Your account is scheduled for deletion
        </div>
        <p className="mt-0.5 text-muted-foreground">
          Everything is erased on {when} — {days} day{days === 1 ? '' : 's'} from now. Nothing has
          been removed yet.
        </p>
      </div>
      <Button className="shrink-0" disabled={cancelling} onClick={cancel}>
        {cancelling ? 'Cancelling…' : 'Keep my account'}
      </Button>
    </div>
  )
}
