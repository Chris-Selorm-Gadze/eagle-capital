import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { useAuth } from './features/auth/AuthContext'
import { useSupabaseData } from './db/useSupabaseData'
import { useTradeStream } from './db/useTradeStream'
import { downloadElementAsImage } from './utils/snapshot'
import { todayISO } from './db/sessions'
import { pathForNav, navForPath, type NavKey } from './shared/routing'
import { notifyPathChange } from './landing/routes'
import { AppShell } from './components/app-shell'
import { ConfirmProvider } from './shared/ui/confirm'
import { navItemFor } from './components/app-shared'
import { brokerSyncConfigured } from './lib/brokerSyncClient'
import { DashboardSkeleton } from './features/dashboard/components/DashboardSkeleton'
import { LoadError } from './shared/ui/LoadError'
import { buildLedgers } from './utils/ledger'
import { DeletionBanner } from './features/settings/DeletionBanner'
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

/* Every lazy route shares one fallback. `deferred-fade-in` (theme.css) keeps it
 * invisible for 220ms, so the common case — a chunk already in memory — shows
 * nothing at all rather than a one-frame "Loading…" flicker between pages. */
function RouteFallback() {
  return (
    <p className="deferred-fade-in text-muted-foreground text-sm" role="status" aria-live="polite">
      Loading…
    </p>
  )
}

/** Pages whose contents come from `useSupabaseData`. They wait for the load and
 * surface its failure; the rest (broker sync, copier, calendar, settings) own
 * their own fetching and must not be blocked by it. */
const DATA_PAGES: NavKey[] = [
  'dashboard', 'cockpit', 'tradelog', 'tradejournal', 'tradermanagement', 'playbooks', 'insights', 'charting',
]

/** Pages the account filter actually narrows.
 *
 * The picker used to render only on the dashboard while the filtered trade list
 * was also handed to the Trade Log — so a filter set on one page silently
 * narrowed another, including its "Delete all N trades shown here" button, with
 * no visible control and no way to clear it. The control is now shown on
 * exactly the pages it affects. */
const ACCOUNT_SCOPED_PAGES: NavKey[] = ['dashboard', 'tradelog', 'tradejournal', 'insights', 'charting']

/** Pages that fetch their own data, so the `useSupabaseData` load never gates
 * them. Listed rather than inferred, because the enter wrapper below has to know
 * whether this branch renders anything at all: an empty wrapper is still a flex
 * child of a `gap-4` column, and would leave a phantom gap on every other page. */
const SELF_FETCHING_PAGES: NavKey[] = ['tradecopier', 'livepositions', 'calendar', 'brokers']

export default function App() {
  const { user } = useAuth()
  const userId = user!.id
  const { accounts, sessions, payouts, rewards, trades, loading, error, refresh } = useSupabaseData(userId)
  // Trades the worker journals arrive from outside the browser; without this
  // they sat in Postgres unseen until someone reloaded the page.
  useTradeStream(userId, refresh)

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
    // Compares pathname only, so a page's own `?tab=` query (see
    // shared/useUrlTab.ts) survives re-renders that don't change the page.
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

  // The page scrolls inside `mainRef`, not the window, so nothing reset it on a
  // route change: arriving at the Dashboard from halfway down a long Trade Log
  // dropped you halfway down the Dashboard, and the enter animation played
  // somewhere above the fold where it could not be seen. Instant, not smooth —
  // scrolling a page you have only just asked for reads as lag.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [nav])

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

  // One derivation of what every account is worth, computed once and passed
  // down. Replaces the stored `accounts.balance` column, which only moved when
  // a session or payout was logged and never when a trade was — see
  // utils/ledger.ts.
  const ledgers = useMemo(
    () => buildLedgers(accounts, trades, sessions, payouts),
    [accounts, trades, sessions, payouts],
  )

  const filteredTrades = accountFilter === 'all' ? trades : trades.filter((t) => t.accountId === accountFilter)
  const filteredSessions = accountFilter === 'all' ? sessions : sessions.filter((s) => s.accountId === accountFilter)
  const dashboardAccounts = accountFilter === 'all' ? accounts : accounts.filter((a) => a.id === accountFilter)
  const filteredPayouts = accountFilter === 'all' ? payouts : payouts.filter((p) => p.accountId === accountFilter)

  const headerActions = ACCOUNT_SCOPED_PAGES.includes(nav) ? (
    <DashboardActions
      accounts={accounts}
      accountFilter={accountFilter}
      onAccountFilterChange={setAccountFilter}
      onAddTrade={() => setChoosingAddMethod(true)}
      onAddAccount={() => setAddingAccount(true)}
      onSnapshot={nav === 'dashboard' ? handleSnapshot : undefined}
      onAccountDeleted={refresh}
    />
  ) : undefined

  const dataPage = DATA_PAGES.includes(nav)
  const blocked = dataPage && (loading || error !== null)

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
        {/* Outside `appSurface` so its shadcn styling isn't overridden by
            theme.css's element rules. Renders nothing unless a deletion is
            actually pending. */}
        <DeletionBanner userId={userId} />

        <div className="appSurface contents">
          {/* A failed load must never fall through to a page's empty state —
              rendering "your desk is empty" at someone whose data merely failed
              to fetch is the worst thing this app could say. */}
          {dataPage && error !== null ? (
            <LoadError message={error} onRetry={refresh} />
          ) : blocked ? (
            <DashboardSkeleton />
          ) : dataPage ? (
            <Suspense fallback={<RouteFallback />}>
              {/* Keyed on the route so the enter animation replays on each
                  arrival. Every nav key maps to its own component, so the key
                  changes nothing about what mounts — it only restarts the
                  animation. */}
              <div className="page-enter" key={nav}>
                {nav === 'dashboard' && (
                  <DashboardPage
                    trades={filteredTrades}
                    accounts={dashboardAccounts}
                    payouts={filteredPayouts}
                    sessions={filteredSessions}
                    ledgers={ledgers}
                    onOpenDateInJournal={handleOpenDateInJournal}
                    onAddAccount={() => setAddingAccount(true)}
                    onAddTrade={() => setChoosingAddMethod(true)}
                    userId={userId}
                    onAccountsChanged={refresh}
                  />
                )}
                {nav === 'cockpit' && (
                  <RiskCockpitPage
                    accounts={accounts}
                    payouts={payouts}
                    rewards={rewards}
                    trades={trades}
                    sessionsByAccountId={sessionsByAccountId}
                    ledgers={ledgers}
                    userId={userId}
                    onChanged={refresh}
                  />
                )}
                {nav === 'tradelog' && <TradeLogPage trades={filteredTrades} accounts={accounts} userId={userId} onChanged={refresh} />}
                {nav === 'tradejournal' && (
                  <TradeJournalPage
                    trades={filteredTrades}
                    accounts={accounts}
                    userId={userId}
                    onChanged={refresh}
                    initialDateFilter={pendingJournalDate}
                  />
                )}
                {nav === 'tradermanagement' && <TraderManagementPage userId={userId} trades={trades} />}
                {nav === 'playbooks' && <PlaybooksPage trades={trades} userId={userId} />}
                {nav === 'insights' && <InsightsPage trades={filteredTrades} accounts={accounts} userId={userId} />}
                {nav === 'charting' && <ChartingPage trades={filteredTrades} />}
              </div>
            </Suspense>
          ) : null}

          {/* Pages that fetch their own data — unaffected by the load above. */}
          {SELF_FETCHING_PAGES.includes(nav) && (
            <Suspense fallback={<RouteFallback />}>
              <div className="page-enter" key={nav}>
                {/* Creating a dashboard account from the copier writes to
                    `accounts`, which this component holds and the copier page
                    does not — without this the new account is invisible on the
                    dashboard until a full page reload. */}
                {nav === 'tradecopier' && <TradeCopierPage onAccountsChanged={refresh} />}
                {nav === 'livepositions' && <LivePositionsPage />}
                {nav === 'calendar' && <EconomicCalendarPage />}
                {nav === 'brokers' && <BrokerConnectionsPage accounts={accounts} userId={userId} />}
              </div>
            </Suspense>
          )}
        </div>

        {/* Settings deliberately sits OUTSIDE `appSurface`. It's built from
            shadcn components, and theme.css's element rules are unlayered —
            which beats Tailwind's layered utilities no matter how low their
            specificity — so inside the wrapper a `variant="destructive"`
            button would still render in the legacy grey. Any new page built on
            shadcn belongs out here too. */}
        {nav === 'settings' && (
          <Suspense fallback={<RouteFallback />}>
            <div className="page-enter">
              <SettingsPage onChanged={refresh} />
            </div>
          </Suspense>
        )}
      </AppShell>

      <div className="appSurface">
        {choosingAddMethod && (
          <AddTradeChooserDialog
            onSelectManual={() => { setChoosingAddMethod(false); setAddingTrade(true) }}
            onSelectImport={() => { setChoosingAddMethod(false); setImportingTrades(true) }}
            onSelectBroker={brokerSyncConfigured
              ? () => { setChoosingAddMethod(false); handleNavigate('brokers') }
              : undefined}
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
