import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useAuth } from './features/auth/AuthContext'
import { useSupabaseData } from './db/useSupabaseData'
import { downloadElementAsImage } from './utils/snapshot'
import { todayISO } from './db/sessions'
import { pathForNav, navForPath, type NavKey } from './shared/routing'
import { notifyPathChange } from './landing/routes'
import { AppShell } from './components/app-shell'
import { ConfirmProvider } from './shared/ui/confirm'
import { navItemFor } from './components/app-shared'
import { DashboardSkeleton } from './features/dashboard/components/DashboardSkeleton'
import { DashboardActions } from './components/dashboard-actions'
import { AddTradeDialog } from './features/trades/components/AddTradeDialog'
import { ImportTradesDialog } from './features/trades/components/ImportTradesDialog'
import { AddTradeChooserDialog } from './features/trades/components/AddTradeChooserDialog'
import { AddAccountDialog } from './features/accounts/components/AddAccountDialog'
import { posthog } from './lib/posthog'

// Route-level code splitting: each nav page becomes its own chunk instead of one shared bundle,
// so e.g. visiting the Dashboard doesn't also download TradingView (Charting), jsPDF/docx
// (Playbooks), or every other page's own dependencies. Named exports, not default — hence the
// .then() adapter, since React.lazy only accepts a module with a default export.
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const RiskCockpitPage = lazy(() => import('./features/accounts/RiskCockpitPage').then((m) => ({ default: m.RiskCockpitPage })))
const TradeCopierPage = lazy(() => import('./features/copier/TradeCopierPage').then((m) => ({ default: m.TradeCopierPage })))
const LivePositionsPage = lazy(() => import('./features/liveposition/LivePositionsPage').then((m) => ({ default: m.LivePositionsPage })))
const TradeLogPage = lazy(() => import('./features/trades/TradeLogPage').then((m) => ({ default: m.TradeLogPage })))
const TradeJournalPage = lazy(() => import('./features/trades/TradeJournalPage').then((m) => ({ default: m.TradeJournalPage })))
const TraderManagementPage = lazy(() => import('./features/tradermanagement/TraderManagementPage').then((m) => ({ default: m.TraderManagementPage })))
const PlaybooksPage = lazy(() => import('./features/playbooks/PlaybooksPage').then((m) => ({ default: m.PlaybooksPage })))
const InsightsPage = lazy(() => import('./features/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })))
const ChartingPage = lazy(() => import('./features/charting/ChartingPage').then((m) => ({ default: m.ChartingPage })))
const EconomicCalendarPage = lazy(() => import('./features/calendar/EconomicCalendarPage').then((m) => ({ default: m.EconomicCalendarPage })))
const BrokerConnectionsPage = lazy(() => import('./features/brokers/BrokerConnectionsPage').then((m) => ({ default: m.BrokerConnectionsPage })))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

export default function App() {
  const { user } = useAuth()
  const userId = user!.id
  const { accounts, sessions, payouts, rewards, trades, loading, refresh } = useSupabaseData(userId)

  const [nav, setNavState] = useState<NavKey>(() => navForPath(window.location.pathname))
  const [accountFilter, setAccountFilter] = useState<string | 'all'>('all')
  const [choosingAddMethod, setChoosingAddMethod] = useState(false)
  const [addingTrade, setAddingTrade] = useState(false)
  const [importingTrades, setImportingTrades] = useState(false)
  const [addingAccount, setAddingAccount] = useState(false)
  const [pendingJournalDate, setPendingJournalDate] = useState<string | undefined>(undefined)
  const mainRef = useRef<HTMLDivElement>(null)
  const fromPopState = useRef(false)

  // Keeps the URL in sync with `nav` and supports the browser back/forward buttons moving
  // between tabs — plain History API, no router library, consistent with this app's
  // "plain React, no state library" approach elsewhere.
  function navigate(key: NavKey) {
    setNavState(key)
  }

  useEffect(() => {
    if (fromPopState.current) {
      fromPopState.current = false
      return
    }
    const path = pathForNav(nav)
    if (window.location.pathname !== path) {
      window.history.pushState({ nav }, '', path)
      // AuthGate subscribes to the path to pick which surface to render;
      // pushState alone fires nothing, so tell it explicitly.
      notifyPathChange()
    }
  }, [nav])

  // Every app page used to share one <title> ("EagleCapital — dashboard"),
  // which made browser history and a row of open tabs useless. The landing site
  // already titles per route; this brings the app in line.
  useEffect(() => {
    const label = navItemFor(nav)?.title ?? 'Dashboard'
    document.title = `${label} — EagleCapital`
  }, [nav])

  // Captured manually rather than relying on PostHog's autocapture history-detection — this app
  // hand-rolls pushState/replaceState (no router library), so calling capture directly here,
  // right where nav changes are already handled, is more reliable than trusting the SDK to infer
  // route changes from history events it didn't originate.
  useEffect(() => {
    posthog.capture('$pageview')
  }, [nav])

  useEffect(() => {
    // The initial page-load history entry has no state attached — replace it so the first
    // back-press after navigating away has a well-defined tab to return to.
    window.history.replaceState({ nav }, '', pathForNav(nav))
    function handlePopState(event: PopStateEvent) {
      const key = (event.state?.nav as NavKey | undefined) ?? navForPath(window.location.pathname)
      fromPopState.current = true
      setNavState(key)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSnapshot() {
    if (!mainRef.current) return
    await downloadElementAsImage(mainRef.current, `eaglecapital-dashboard-${todayISO()}.png`)
  }

  function handleNavigate(key: NavKey) {
    setPendingJournalDate(undefined)
    navigate(key)
  }

  function handleOpenDateInJournal(date: string) {
    setPendingJournalDate(date)
    navigate('tradejournal')
  }

  const sessionsByAccountId = new Map<string, typeof sessions>()
  for (const s of sessions) {
    const list = sessionsByAccountId.get(s.accountId) ?? []
    list.push(s)
    sessionsByAccountId.set(s.accountId, list)
  }

  const filteredTrades = accountFilter === 'all' ? trades : trades.filter((t) => t.accountId === accountFilter)
  const dashboardAccounts = accountFilter === 'all' ? accounts : accounts.filter((a) => a.id === accountFilter)
  const filteredPayouts = accountFilter === 'all' ? payouts : payouts.filter((p) => p.accountId === accountFilter)

  const headerActions =
    nav === 'dashboard' ? (
      <DashboardActions
        accounts={accounts}
        accountFilter={accountFilter}
        onAccountFilterChange={setAccountFilter}
        onAddTrade={() => setChoosingAddMethod(true)}
        onAddAccount={() => setAddingAccount(true)}
        onSnapshot={handleSnapshot}
        onAccountDeleted={refresh}
      />
    ) : undefined

  return (
    <ConfirmProvider>
      {/* `appSurface` keeps the legacy CSS-Module pages styled by theme.css.
          The shell chrome sits outside it so shadcn's own styling isn't
          overridden by those element-level rules. */}
      <AppShell
        active={nav}
        navigate={handleNavigate}
        onAddTrade={() => setChoosingAddMethod(true)}
        headerActions={headerActions}
        contentRef={mainRef}
      >
        <div className="appSurface contents">
          <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
            {nav === 'dashboard' &&
              (loading ? (
                <DashboardSkeleton />
              ) : (
                <DashboardPage
                  trades={filteredTrades}
                  accounts={dashboardAccounts}
                  payouts={filteredPayouts}
                  onOpenDateInJournal={handleOpenDateInJournal}
                  onAddAccount={() => setAddingAccount(true)}
                  onAddTrade={() => setChoosingAddMethod(true)}
                />
              ))}
            {nav === 'cockpit' && (
              <RiskCockpitPage
                accounts={accounts}
                payouts={payouts}
                rewards={rewards}
                sessionsByAccountId={sessionsByAccountId}
                userId={userId}
                onChanged={refresh}
              />
            )}
            {nav === 'tradecopier' && <TradeCopierPage />}
            {nav === 'livepositions' && <LivePositionsPage />}
            {nav === 'tradelog' && <TradeLogPage trades={filteredTrades} accounts={accounts} userId={userId} onChanged={refresh} />}
            {nav === 'tradejournal' && (
              <TradeJournalPage
                trades={trades}
                accounts={accounts}
                userId={userId}
                onChanged={refresh}
                initialDateFilter={pendingJournalDate}
              />
            )}
            {nav === 'tradermanagement' && <TraderManagementPage userId={userId} trades={trades} />}
            {nav === 'playbooks' && <PlaybooksPage trades={trades} userId={userId} />}
            {nav === 'insights' && <InsightsPage trades={trades} accounts={accounts} userId={userId} />}
            {nav === 'charting' && <ChartingPage trades={trades} />}
            {nav === 'calendar' && <EconomicCalendarPage />}
            {nav === 'brokers' && <BrokerConnectionsPage accounts={accounts} userId={userId} />}
          </Suspense>
        </div>

        {/* Settings deliberately sits OUTSIDE `appSurface`. It's built from
            shadcn components, and theme.css's element rules are unlayered —
            which beats Tailwind's layered utilities no matter how low their
            specificity — so inside the wrapper a `variant="destructive"`
            button would still render in the legacy grey. Any new page built on
            shadcn belongs out here too. */}
        <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
          {nav === 'settings' && <SettingsPage onChanged={refresh} />}
        </Suspense>
      </AppShell>

      <div className="appSurface">
        {choosingAddMethod && (
          <AddTradeChooserDialog
            onSelectManual={() => { setChoosingAddMethod(false); setAddingTrade(true) }}
            onSelectImport={() => { setChoosingAddMethod(false); setImportingTrades(true) }}
            onSelectBroker={() => { setChoosingAddMethod(false); handleNavigate('brokers') }}
            onClose={() => setChoosingAddMethod(false)}
          />
        )}
        {addingTrade && (
          <AddTradeDialog accounts={accounts} userId={userId} onClose={() => setAddingTrade(false)} onSaved={refresh} onAccountAdded={refresh} />
        )}
        {importingTrades && (
          <ImportTradesDialog accounts={accounts} userId={userId} onClose={() => setImportingTrades(false)} onSaved={refresh} onAccountAdded={refresh} />
        )}
        {addingAccount && (
          <AddAccountDialog userId={userId} onClose={() => setAddingAccount(false)} onSaved={refresh} />
        )}
      </div>
    </ConfirmProvider>
  )
}
