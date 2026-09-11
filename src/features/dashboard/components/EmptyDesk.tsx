import { BriefcaseIcon, NotebookPenIcon, UploadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

/* The first screen after signing up.
 *
 * It used to be the live dashboard with every number at zero: four $0 cards,
 * two empty chart frames and a blank calendar month. That's not an empty state,
 * it's a broken-looking one — and it gave a new user nothing to do. */

interface EmptyDeskProps {
  hasAccounts: boolean
  onAddAccount: () => void
  onAddTrade: () => void
}

export function EmptyDesk({ hasAccounts, onAddAccount, onAddTrade }: EmptyDeskProps) {
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
