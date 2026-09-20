import { useState } from 'react'
import { ClockIcon, FileTextIcon, ListChecksIcon } from 'lucide-react'
import type { ReportCard, Trade } from '../../types'
import { ReportCardPage } from '../reportcard/ReportCardPage'
import { CompletedReportCardsPage } from '../reportcard/CompletedReportCardsPage'
import { RulesPage } from './RulesPage'
import { useUrlTab } from '../../shared/useUrlTab'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/shared/ui/page'

/* Converted onto shadcn Tabs and off FontAwesome onto lucide.
 *
 * The tab strip stays driven by `useUrlTab` rather than Radix's own state,
 * because the tab lives in the URL — Rules can be linked to directly and the
 * back button steps between tabs. Radix owns the presentation and the keyboard
 * behaviour; the URL stays the source of truth. */

type SubTab = 'reportcard' | 'completed' | 'rules'

const SUB_TAB_KEYS = ['reportcard', 'completed', 'rules'] as const

const SUB_TABS = [
  { key: 'reportcard', label: 'Daily Report Card', Icon: FileTextIcon },
  { key: 'completed', label: 'Completed DRCs', Icon: ClockIcon },
  { key: 'rules', label: 'Rules', Icon: ListChecksIcon },
] as const

const DESCRIPTION: Record<SubTab, string> = {
  reportcard: 'Grade today while it’s fresh — what you followed, what you didn’t, and why.',
  completed: 'Every report card you’ve filed. Open one to read it back.',
  rules: 'Your own trading rules, independent of any firm’s.',
}

export function TraderManagementPage({ userId, trades }: { userId: string; trades: Trade[] }) {
  // In the URL, so Rules can be linked to and Back steps between tabs.
  const [tab, setTab] = useUrlTab<SubTab>(SUB_TAB_KEYS, 'reportcard', 'tradermanagement')
  const [openedCard, setOpenedCard] = useState<ReportCard | null>(null)
  const [resetToken, setResetToken] = useState(0)

  function openReportCard(card: ReportCard) {
    setOpenedCard(card)
    setTab('reportcard')
  }

  function goToFreshReportCard() {
    setOpenedCard(null)
    setResetToken((t) => t + 1)
    setTab('reportcard')
  }

  function closeOpenedCard() {
    setOpenedCard(null)
    setResetToken((t) => t + 1)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader description={DESCRIPTION[tab]} title="Trader Management" />

      <Tabs
        onValueChange={(v) => (v === 'reportcard' ? goToFreshReportCard() : setTab(v as SubTab))}
        value={tab}
      >
        <TabsList>
          {SUB_TABS.map(({ key, label, Icon }) => (
            <TabsTrigger key={key} value={key}>
              <Icon />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* The report card stays MOUNTED but hidden rather than unmounted, so a
          half-filled card survives a trip to the Rules tab and back. The other
          two hold nothing worth losing, so they unmount normally.
          Deliberately not TabsContent, which unmounts.

          `appSurface` is scoped to this subtree on purpose. The report card's six
          section components hold 21 bare `<input>` / `<textarea>` / `<select>`
          elements that theme.css paints for them, and they convert as their own
          pass. Everything else on this page — the tabs, Rules, Completed DRCs —
          is shadcn and sits outside the wrapper. This comes off with the last
          section; App.tsx's CONVERTED_PAGES list explains the mechanism. */}
      <div
        className="appSurface"
        style={{ display: tab === 'reportcard' ? 'block' : 'none' }}
      >
        <ReportCardPage
          key={openedCard ? `opened-${openedCard.id}` : `blank-${resetToken}`}
          userId={userId}
          trades={trades}
          openedCard={openedCard}
          onClose={closeOpenedCard}
          onSaved={closeOpenedCard}
        />
      </div>
      {tab === 'completed' && <CompletedReportCardsPage trades={trades} onOpen={openReportCard} />}
      {tab === 'rules' && <RulesPage userId={userId} />}
    </div>
  )
}
