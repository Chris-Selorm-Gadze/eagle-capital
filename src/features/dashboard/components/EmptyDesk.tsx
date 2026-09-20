import { useCallback, useEffect, useState } from 'react'
import { BriefcaseIcon, NotebookPenIcon, PlugZapIcon, UploadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listTradingAccounts, type TradingAccount } from '../../../db/copier'
import { journalAllAccounts } from '../../../db/copierActions'
import { errorMessage } from '../../../utils/errors'
import { accountCount, deskState } from '../deskState'

/* The first screen after signing up — and the screen for anyone whose
 * dashboard has no trades on it yet, which is not the same thing.
 *
 * It used to be the live dashboard with every number at zero: four $0 cards,
 * two empty chart frames and a blank calendar month. That's not an empty state,
 * it's a broken-looking one — and it gave a new user nothing to do.
 *
 * Then it was three onboarding steps, always. That told a user with seven
 * connected MT5 accounts to "add an account", because the dashboard is built
 * from `trades` and had never heard of `trading_accounts`. See ../deskState.ts
 * for why connected and journalled are different things. */

interface EmptyDeskProps {
  userId: string
  hasAccounts: boolean
  onAddAccount: () => void
  onAddTrade: () => void
  onAccountsChanged?: () => void
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 bg-card p-5">{children}</div>
}

export function EmptyDesk({
  userId,
  hasAccounts,
  onAddAccount,
  onAddTrade,
  onAccountsChanged,
}: EmptyDeskProps) {
  const [connected, setConnected] = useState<TradingAccount[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setConnected((await listTradingAccounts()).filter((a) => a.isEnabled))
    } catch {
      // The copier tables are optional to this page: a user who has never
      // opened the Trade Copier still gets the onboarding steps below rather
      // than an error on the screen that is meant to welcome them.
      setConnected([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleJournalAll(accounts: TradingAccount[]) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const { created, failed } = await journalAllAccounts(userId, accounts)
      await load()
      onAccountsChanged?.()
      if (failed.length > 0) {
        setError(
          `Journalled ${created}, but could not do ${failed.join(', ')}. `
          + 'Open the Trade Copier to see why.',
        )
      } else {
        setNotice(
          `${created} account${created === 1 ? '' : 's'} journalled. Closed trades arrive `
          + 'within a few minutes, and the first read reaches back 72 hours.',
        )
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // Until the copier accounts are known, the three onboarding steps would be a
  // guess — and it is the wrong guess for exactly the user this matters to.
  if (connected === null) return null

  const state = deskState({
    hasAccounts,
    connectedAccounts: connected.length,
    journalledAccounts: connected.filter((a) => a.journalAccountId).length,
  })

  if (state.kind === 'connected-unjournalled') {
    const unjournalled = connected.filter((a) => !a.journalAccountId)
    return (
      <div className="flex flex-col gap-6">
        <div className="max-w-2xl">
          <h2 className="font-heading text-xl font-medium">
            {accountCount(state.connected)}, no history yet
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Your accounts are connected and their balances are being read. Their trade
            history is still in MT5 — the copier tables hold a reading taken now, with no
            past in them, and every chart on this page is built from closed trades.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-2">
          <Panel>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <PlugZapIcon className="size-4" />
              </span>
              <span className="text-muted-foreground text-xs">Journal them</span>
            </div>
            <div className="flex-1">
              <h3 className="font-heading text-sm font-medium">
                Bring {unjournalled.length === 1 ? 'it' : 'them'} onto the dashboard
              </h3>
              <p className="mt-1 text-muted-foreground text-sm">
                Creates one dashboard account per connected account, named after the broker
                account. Closed trades then arrive on their own, reaching back 72 hours on
                the first read. Drawdown limits and profit targets are left blank for you.
              </p>
            </div>
            <div>
              <Button disabled={busy} onClick={() => void handleJournalAll(unjournalled)} size="sm">
                {busy ? 'Journalling…' : `Journal ${accountCount(unjournalled.length)}`}
              </Button>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <NotebookPenIcon className="size-4" />
              </span>
              <span className="text-muted-foreground text-xs">Or do it by hand</span>
            </div>
            <div className="flex-1">
              <h3 className="font-heading text-sm font-medium">Log or import trades yourself</h3>
              <p className="mt-1 text-muted-foreground text-sm">
                Journalling is not the only way in. You can type trades, or import a CSV from
                somewhere else, against any account you have added.
              </p>
            </div>
            <div className="flex gap-2">
              <Button disabled={!hasAccounts} onClick={onAddTrade} size="sm" variant="outline">
                Log a trade
              </Button>
              <Button onClick={onAddAccount} size="sm" variant="outline">
                Add account
              </Button>
            </div>
          </Panel>
        </div>

        {notice && <p className="text-muted-foreground text-sm">{notice}</p>}
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
    )
  }

  if (state.kind === 'awaiting-history') {
    return (
      <div className="flex flex-col gap-4">
        <div className="max-w-2xl">
          <h2 className="font-heading text-xl font-medium">Waiting for your first trades</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {accountCount(state.journalled)} {state.journalled === 1 ? 'is' : 'are'} journalling
            into the dashboard, and nothing has arrived yet. The first read reaches back 72
            hours, so an account with no closed trades in that window stays empty until it has
            one. If it stays empty longer than a few minutes, check the worker is running on
            the Trade Copier page.
          </p>
        </div>
        <div>
          <Button onClick={onAddTrade} size="sm" variant="outline">Log a trade meanwhile</Button>
        </div>
      </div>
    )
  }

  const steps = [
    {
      icon: <BriefcaseIcon className="size-4" />,
      title: 'Add an account',
      body: 'A prop-firm evaluation, a funded account, or your own live broker account. You type your own numbers — no firm’s rules are assumed.',
      action: (
        <Button onClick={onAddAccount} size="sm" variant={hasAccounts ? 'outline' : 'default'}>
          Add account
        </Button>
      ),
      done: hasAccounts,
    },
    {
      icon: <NotebookPenIcon className="size-4" />,
      title: 'Log your first trade',
      body: 'Entry, exit, size. Everything on this page — win rate, profit factor, the equity curve — is built from these.',
      action: (
        <Button disabled={!hasAccounts} onClick={onAddTrade} size="sm" variant={hasAccounts ? 'default' : 'outline'}>
          Log a trade
        </Button>
      ),
      done: false,
    },
    {
      icon: <UploadIcon className="size-4" />,
      title: 'Or import a CSV',
      body: 'Already have history somewhere else? Bring it in and the dashboard fills itself.',
      action: (
        <Button disabled={!hasAccounts} onClick={onAddTrade} size="sm" variant="outline">
          Import trades
        </Button>
      ),
      done: false,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-xl">
        <h2 className="font-heading text-xl font-medium">Your desk is empty</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Three steps and this page starts telling you the truth about how you trade.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3">
        {steps.map((s, i) => (
          <div className="flex flex-col gap-3 bg-card p-5" key={s.title}>
            <div className="flex items-center gap-2">
              <span
                className={
                  s.done
                    ? 'flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground'
                    : 'flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground'
                }
              >
                {s.icon}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                Step {i + 1}
                {s.done ? ' · done' : ''}
              </span>
            </div>
            <div className="flex-1">
              <h3 className="font-heading text-sm font-medium">{s.title}</h3>
              <p className="mt-1 text-muted-foreground text-sm">{s.body}</p>
            </div>
            <div>{s.action}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
