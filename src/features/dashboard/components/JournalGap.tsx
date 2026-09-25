import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Notice } from '@/shared/ui/page'
import { listTradingAccounts, type TradingAccount } from '../../../db/copier'
import { journalAllAccounts } from '../../../db/copierActions'
import { errorMessage } from '../../../utils/errors'

/* Connected accounts whose trades are not reaching this dashboard.
 *
 * EmptyDesk covers the desk with nothing journalled. This covers the desk that
 * is PART journalled, which looked perfectly healthy: a master copying to four
 * followers with only two of them journalled recorded three trades of every
 * five, and nothing on the page said a thing about the other two. The worker
 * only reads history for an account pointed at a dashboard account, so the
 * missing trades were never going to arrive on their own.
 */
export function JournalGap({
  userId,
  onAccountsChanged,
}: {
  userId: string
  onAccountsChanged?: () => void
}) {
  const [missing, setMissing] = useState<TradingAccount[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const connected = await listTradingAccounts()
      setMissing(connected.filter((a) => a.isEnabled && !a.journalAccountId))
    } catch {
      // Optional on this page: a user who never set up the copier has no
      // copier tables to read, and that is not an error on their dashboard.
      setMissing([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (missing.length === 0) return null

  async function handleJournal() {
    setBusy(true)
    try {
      const { created, failed } = await journalAllAccounts(userId, missing)
      await load()
      onAccountsChanged?.()
      if (failed.length > 0) {
        toast.error(`Journalled ${created}, but could not do ${failed.join(', ')}. Open the Trade Copier to see why.`)
      } else {
        toast.success(
          `${created} account${created === 1 ? '' : 's'} journalled. Their recent closed trades `
          + 'arrive within a minute, reaching back 72 hours.',
        )
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const names = missing.map((a) => a.label || a.accountNumber).join(', ')
  const n = missing.length

  return (
    <Notice
      action={
        <Button disabled={busy} onClick={() => void handleJournal()} size="xs" variant="outline">
          {busy ? 'Journalling…' : `Journal ${n === 1 ? 'it' : `these ${n}`}`}
        </Button>
      }
    >
      {n === 1 ? '1 connected account is' : `${n} connected accounts are`} not sending trades to
      this dashboard ({names}), so {n === 1 ? 'its' : 'their'} closed trades — including copies of
      your master’s — are missing from every figure here.
    </Notice>
  )
}
