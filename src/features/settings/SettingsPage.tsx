import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { useAuth } from '../auth/AuthContext'
import { ensureProfile, updateUsername, type Profile } from '../../db/profiles'
import { deleteAllUserData, downloadFile, exportAllData, tradesToCsv } from '../../db/userData'
import { errorMessage } from '../../utils/errors'
import { todayISO } from '../../db/sessions'

/* Account settings. Before this existed the only account control in the whole
 * app was a username field buried in the sidebar user menu, and there was no
 * way to get your data out or to leave — both of which the marketing site
 * promises. */

export function SettingsPage({ onChanged }: { onChanged: () => void }) {
  const { user, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [username, setUsername] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ensureProfile(user.id, user.email).then((p) => {
      if (cancelled) return
      setProfile(p)
      setUsername(p.username)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  async function handleSaveUsername() {
    if (!user) return
    setSavingName(true)
    try {
      const updated = await updateUsername(user.id, username)
      setProfile(updated)
      setUsername(updated.username)
      toast.success('Username updated')
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSavingName(false)
    }
  }

  async function handleExport(format: 'json' | 'csv') {
    setExporting(true)
    try {
      const bundle = await exportAllData()
      if (format === 'csv') {
        const csv = tradesToCsv(bundle.tables.trades as Record<string, unknown>[])
        if (!csv) {
          toast.info('No trades to export yet.')
          return
        }
        downloadFile(`eaglecapital-trades-${todayISO()}.csv`, csv, 'text/csv')
      } else {
        downloadFile(
          `eaglecapital-export-${todayISO()}.json`,
          JSON.stringify(bundle, null, 2),
          'application/json',
        )
      }
      toast.success('Export downloaded')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    if (!user) return
    setDeleting(true)
    try {
      await deleteAllUserData(user.id)
      toast.success('Your data has been deleted.')
      await signOut()
    } catch (err) {
      toast.error(errorMessage(err))
      setDeleting(false)
    }
  }

  const nameUnchanged = !username.trim() || username === profile?.username

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-medium">Settings</h1>
        <p className="text-muted-foreground text-sm">{user?.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Username</CardTitle>
          <CardDescription>
            Shown on your desk. Letters, numbers and underscores only.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="settings-username">Username</Label>
            <Input
              id="settings-username"
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              value={username}
            />
          </div>
          <Button disabled={savingName || nameUnchanged} onClick={handleSaveUsername}>
            {savingName ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export your data</CardTitle>
          <CardDescription>
            Everything you&rsquo;ve logged, in a format you can keep. Nothing is deleted by
            exporting.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button disabled={exporting} onClick={() => handleExport('csv')} variant="outline">
            {exporting ? 'Preparing…' : 'Download trades (CSV)'}
          </Button>
          <Button disabled={exporting} onClick={() => handleExport('json')} variant="outline">
            {exporting ? 'Preparing…' : 'Download everything (JSON)'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign out</CardTitle>
          <CardDescription>End this session on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void signOut()} variant="outline">
            Sign out
          </Button>
        </CardContent>
      </Card>

      {/* Destructive, so it's visually separated and gated behind typing the word. */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Delete your data</CardTitle>
          <CardDescription>
            Permanently deletes every account, trade, session, payout, playbook and report card
            you&rsquo;ve logged. This cannot be undone — export first if you want a copy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              setDeleteConfirmText('')
              setConfirmingDelete(true)
            }}
            variant="destructive"
          >
            Delete everything
          </Button>
        </CardContent>
      </Card>

      <AlertDialog onOpenChange={setConfirmingDelete} open={confirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all your data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every account, trade, session, payout, reward, playbook, report card
              and broker connection on your account. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="delete-confirm">
              Type <span className="font-medium text-foreground">DELETE</span> to confirm
            </Label>
            <Input
              autoComplete="off"
              id="delete-confirm"
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              value={deleteConfirmText}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting || deleteConfirmText !== 'DELETE'}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
            >
              {deleting ? 'Deleting…' : 'Delete everything'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
