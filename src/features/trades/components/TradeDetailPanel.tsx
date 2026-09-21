import { useEffect, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, ChartLineIcon, BookOpenIcon, TagIcon, SquarePenIcon } from 'lucide-react'
import type { Playbook, PlaybookExample, Trade } from '../../../types'
import { updateTrade } from '../../../db/trades'
import { tradeOutcome, tradeDurationMinutes } from '../../../utils/tradeStats'
import { formatDuration } from '../../../utils/format'
import { errorMessage } from '../../../utils/errors'
import { TradeStatsTab } from './tabs/TradeStatsTab'
import { TradeStrategyTab } from './tabs/TradeStrategyTab'
import { TradeTagsTab } from './tabs/TradeTagsTab'
import { TradeNotesTab } from './tabs/TradeNotesTab'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ErrorNotice } from '@/shared/ui/page'
import { cn } from 'cn'
import { tradingDayOf } from '../../../utils/tradingDay'
import styles from './TradeDetailPanel.module.css'

/* Converted onto shadcn Card + Tabs.
 *
 * The tab strip was four buttons with a hand-rolled `.tabActive` class and
 * FontAwesome icons — the only FontAwesome left in this pane. Radix Tabs brings
 * the roving focus, the arrow-key navigation and the `aria-selected` wiring the
 * hand-rolled version never had, and the icons are lucide like the rest of the
 * shell. */

// Chart is no longer a tab here — it's always visible in its own pane (see TradeChartPanel),
// so this panel only needs to switch between these four.
const TABS = [
  { key: 'stats', label: 'Stats', Icon: ChartLineIcon },
  { key: 'notes', label: 'Notes', Icon: SquarePenIcon },
  { key: 'strategy', label: 'Strategy', Icon: BookOpenIcon },
  { key: 'tags', label: 'Tags', Icon: TagIcon },
] as const

const OUTCOME_LABEL: Record<ReturnType<typeof tradeOutcome>, string> = {
  win: 'Win',
  loss: 'Loss',
  breakeven: 'Breakeven',
}

const OUTCOME_TONE: Record<ReturnType<typeof tradeOutcome>, string> = {
  win: 'var(--good)',
  loss: 'var(--critical)',
  breakeven: 'var(--text-muted)',
}

export function TradeDetailPanel({
  trade,
  orderedTrades,
  onSelect,
  userId,
  onChanged,
  playbooks,
  playbookExamples,
  onPlaybooksChanged,
}: {
  trade: Trade
  orderedTrades: Trade[]
  onSelect: (id: string) => void
  userId: string
  onChanged: () => void
  playbooks: Playbook[]
  playbookExamples: PlaybookExample[]
  onPlaybooksChanged: () => void
}) {
  const [draft, setDraft] = useState<Trade>(trade)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    setDraft(trade)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.id])

  function patch(p: Partial<Trade>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  const index = orderedTrades.findIndex((t) => t.id === trade.id)
  const prevTrade = index > 0 ? orderedTrades[index - 1] : undefined
  const nextTrade = index >= 0 && index < orderedTrades.length - 1 ? orderedTrades[index + 1] : undefined

  const outcome = tradeOutcome(trade.pnl)
  const heldMinutes = tradeDurationMinutes(trade.entryTime, trade.exitTime)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateTrade(trade.id!, draft, draft.pnl)
      onChanged()
      setSavedMessage('Saved')
      setTimeout(() => setSavedMessage(''), 1600)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-2 border-b py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            aria-label="Previous trade"
            disabled={!prevTrade}
            onClick={() => prevTrade && onSelect(prevTrade.id!)}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronLeftIcon />
          </Button>
          <span className="font-heading font-semibold text-base">{trade.symbol}</span>
          <Badge className="uppercase" variant="outline">{trade.side}</Badge>
          <Badge
            style={{
              // Tinted from the outcome's own token, so the chip and the P&L
              // figure below it are the same colour.
              background: `color-mix(in srgb, ${OUTCOME_TONE[outcome]} 15%, transparent)`,
              color: OUTCOME_TONE[outcome],
            }}
            variant="secondary"
          >
            {OUTCOME_LABEL[outcome]}
          </Badge>
          <Button
            aria-label="Next trade"
            className="ml-auto"
            disabled={!nextTrade}
            onClick={() => nextTrade && onSelect(nextTrade.id!)}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {/* tradingDayOf, not a slice of the ISO string — that slice is the UTC
              date, so an evening US trade showed a day later here than the day
              the journal and calendar file it under. */}
          Opened {tradingDayOf(trade.entryTime)} · Closed {tradingDayOf(trade.exitTime)} · Held{' '}
          {formatDuration(heldMinutes)}
        </p>
      </CardHeader>

      <div className="flex items-baseline justify-between gap-3 border-b px-4 py-2.5">
        <span className="text-muted-foreground text-xs">Net P&amp;L</span>
        <span
          className="font-semibold text-xl tabular-nums"
          style={{ color: trade.pnl >= 0 ? 'var(--good-deep)' : 'var(--critical-deep)' }}
        >
          {trade.pnl >= 0 ? '+' : '-'}${Math.abs(trade.pnl).toLocaleString()}
        </span>
      </div>

      <Tabs className="gap-0" defaultValue="stats">
        <TabsList className="w-full justify-start rounded-none border-b px-2">
          {TABS.map(({ key, label, Icon }) => (
            <TabsTrigger key={key} value={key}>
              <Icon />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* One scroller for every tab, so switching tabs doesn't change the
            panel's height and shove the chart pane beside it up or down. */}
        <CardContent className={cn('py-4', styles.tabScroll)}>
          <TabsContent value="stats">
            <TradeStatsTab draft={draft} onChange={patch} />
          </TabsContent>
          <TabsContent value="notes">
            <TradeNotesTab draft={draft} onChange={patch} />
          </TabsContent>
          <TabsContent value="strategy">
            <TradeStrategyTab
              onChanged={onPlaybooksChanged}
              playbookExamples={playbookExamples}
              playbooks={playbooks}
              tradeId={trade.id!}
              userId={userId}
            />
          </TabsContent>
          <TabsContent value="tags">
            <TradeTagsTab draft={draft} onChange={patch} />
          </TabsContent>
        </CardContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
        <Button disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {savedMessage && (
          <span className="text-(--good-deep) text-xs" role="status">{savedMessage}</span>
        )}
        {error && <ErrorNotice className="w-full" message={error} />}
      </div>
    </Card>
  )
}
