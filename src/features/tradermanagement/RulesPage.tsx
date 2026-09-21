import { useEffect, useState } from 'react'
import type { TradingRule } from '../../types'
import { listTradingRules, addTradingRule, updateTradingRule, deleteTradingRule } from '../../db/tradingRules'
import { errorMessage } from '../../utils/errors'
import { useConfirm } from '../../shared/ui/confirm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState, ErrorNotice, LoadingRows } from '@/shared/ui/page'
import { ListChecksIcon } from 'lucide-react'

/* Converted onto shadcn Card, Input, Checkbox and Badge.
 *
 * The "Core" checkbox was a bare `<input type="checkbox">` inside a label,
 * styled by nothing — it had no visible focus state and no consistent size
 * across browsers. Radix's checkbox is a real control with both. */

export function RulesPage({ userId }: { userId: string }) {
  const confirm = useConfirm()
  const [rules, setRules] = useState<TradingRule[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [isCore, setIsCore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  async function refresh() {
    setRules(await listTradingRules())
  }

  // A failed load must not render as "no rules yet" — telling someone they have
  // no rules when the fetch merely failed is worse than saying nothing.
  function load() {
    setLoading(true)
    setLoadError(null)
    refresh()
      .catch((err) => setLoadError(errorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd() {
    if (!text.trim()) return
    setError(null)
    try {
      await addTradingRule(userId, { text: text.trim(), isCore })
      setText('')
      setIsCore(false)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleToggleCore(rule: TradingRule) {
    setError(null)
    try {
      await updateTradingRule(rule.id!, { isCore: !rule.isCore })
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: 'Delete this rule?', confirmLabel: 'Delete', destructive: true }))) return
    setError(null)
    try {
      await deleteTradingRule(id)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (loading) return <LoadingRows rows={4} />
  if (loadError) return <ErrorNotice message={loadError} onRetry={load} />

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Your own trading rules — independent of any prop firm. Mark the non-negotiable ones as Core.
      </p>

      {error && <ErrorNotice message={error} />}

      {rules.length === 0 ? (
        <EmptyState
          description="Write down the one you break most often. Mark it Core, and the daily report card will ask about it."
          icon={<ListChecksIcon />}
          title="No rules yet"
        />
      ) : (
        <Card className="gap-0 py-0">
          <CardContent className="px-0">
            {rules.map((r) => (
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0"
                key={r.id}
              >
                <span className="min-w-0 flex-1 text-sm">{r.text}</span>
                {r.isCore && (
                  <Badge
                    style={{
                      background: 'color-mix(in srgb, var(--warning) 15%, transparent)',
                      color: 'var(--warning)',
                    }}
                    variant="secondary"
                  >
                    Core
                  </Badge>
                )}
                <div className="flex gap-1">
                  <Button onClick={() => handleToggleCore(r)} size="xs" variant="outline">
                    {r.isCore ? 'Unmark core' : 'Mark core'}
                  </Button>
                  <Button onClick={() => handleDelete(r.id!)} size="xs" variant="destructive">
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a rule</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="Rule"
            className="min-w-56 flex-1"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. No trades after 3 consecutive losses"
            value={text}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              checked={isCore}
              id="rule-is-core"
              onCheckedChange={(v) => setIsCore(v === true)}
            />
            <Label className="cursor-pointer font-normal" htmlFor="rule-is-core">Core</Label>
          </div>
          <Button disabled={!text.trim()} onClick={handleAdd}>Add rule</Button>
        </CardContent>
      </Card>
    </div>
  )
}
