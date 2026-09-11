/* Landing copy, lifted from homepage/copy.txt and kept as data rather than
 * inlined in JSX — the copy deck is the source of truth and it's easier to
 * keep the two in sync when every string lives in one file.
 *
 * Claims here are deliberately narrow (MT5 live, Tradovate blocked, futures
 * copying absent). If you widen one, widen the code first. */

export interface FeatureItem {
  n: string
  name: string
  body: string
}

/** The 12 shipped tools. Order matches the sidebar's own priority. */
export const TOOLS: FeatureItem[] = [
  { n: '01', name: 'Dashboard', body: 'KPIs, cumulative P&L, a calendar heatmap and time-of-day scatters that show when you actually make money.' },
  { n: '02', name: 'Live Positions', body: 'Open positions across connected accounts, streaming over WebSocket, with unrealized P&L in one total.' },
  { n: '03', name: 'Trade Journal', body: 'Three panes: your trades, the analysis, the chart. Tag it, rate it, write the note you’ll need to read next month.' },
  { n: '04', name: 'Trader Management', body: 'A daily report card with a 5 Whys review — and an execution checklist built from your rules, not a generic list someone else wrote.' },
  { n: '05', name: 'Playbooks', body: 'Document a setup, attach real trades to it, and find out whether it actually works. Export to PDF or Word.' },
  { n: '06', name: 'AI Insights', body: 'Two layers: instant pattern detection that costs nothing and runs on your own data, plus an on-demand coaching digest when you want depth.' },
  { n: '07', name: 'Prop Firm Manager', body: 'Challenges, funded accounts, payouts, rewards and scaling cycles. Firm-agnostic, every number yours.' },
  { n: '08', name: 'Charting', body: 'Full TradingView Advanced Chart for any symbol, without leaving.' },
  { n: '09', name: 'Economic Calendar', body: 'Real structured release data — filterable by impact and by currency. Not an iframe of someone else’s widget.' },
  { n: '10', name: 'Trade Log', body: 'The whole book in one sortable table. Filter, bulk-edit, bulk-delete.' },
  { n: '11', name: 'Trade Copier', body: 'Real order copying between MT4/5 accounts. Master/follower groups, live P&L, risk stopouts and a flatten-all button you hope to never need.' },
  { n: '12', name: 'Broker Connections', body: 'Link a real MT5 account and pull real balances and fills. One login can expose several accounts — you pick which to import.' },
]

export const TRUST_POINTS = [
  'Live MT5 sync',
  'Real order copying',
  'Row-level security',
  '12 tools',
  'Data exportable',
  'No firm lock-in',
]

export const PAIN_POINTS = [
  {
    n: '01',
    title: 'Scattered',
    body: 'Every firm has its own dashboard, its own rules, its own login. None of them talk to each other, and none of them show you the whole book.',
  },
  {
    n: '02',
    title: 'Unexamined',
    body: 'You know you tilt. You don’t know that it costs you 4.2% a month, or that it always starts on the second loss before 10am.',
  },
  {
    n: '03',
    title: 'Manual',
    body: 'Copying a trade to three accounts by hand is how you end up with three different fills and one very expensive typo.',
  },
]

export const STEPS = [
  {
    n: '01',
    title: 'Add your accounts',
    body: 'Prop-firm challenge, funded account, or your own live broker account. Enter your own risk numbers — max drawdown, daily loss limit, profit target. EagleCapital never guesses them, because every firm is different and guessing wrong is how people get breached.',
  },
  {
    n: '02',
    title: 'Get your trades in',
    body: 'Import a CSV from your platform, log trades by hand, or connect a real MT5 account and let it sync. Re-importing the same file is safe — it dedupes on fill time and price.',
  },
  {
    n: '03',
    title: 'Actually review',
    body: 'Daily report card, playbook stats, and pattern detection that tells you what you did, not what you meant to do.',
  },
]

/* ---------------------------------------------------------------- features */

export interface FeaturePage {
  slug: string
  nav: string
  eyebrow: string
  h1: string
  subhead: string
  intro: string[]
  bullets?: { label: string; body?: string }[]
  aside?: { title: string; body: string; tone: 'honest' | 'risk' }
  extra?: { title: string; body: string }
  table?: { name: string; status: string; tone: 'live' | 'blocked' | 'planned' }[]
  cta: string
}

export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: 'trade-journal',
    nav: 'Trade Journal',
    eyebrow: 'Capture',
    h1: 'A journal you’ll actually keep.',
    subhead: 'Three panes, five tabs, and the chart right there.',
    intro: ['Most journals fail because reviewing a trade means opening four things. Here it’s one screen: your trades on the left, the analysis in the middle, the price chart on the right.'],
    bullets: [
      { label: 'Stats, tags, notes, strategy and chart — five tabs, no context switch' },
      { label: 'Rate a trade 1–5 and tag it however you think ("FOMO", "A+ setup")' },
      { label: 'Record planned stop and target, so you can see what you actually did versus what you planned' },
      { label: 'Jump straight from a red day on the dashboard heatmap into that day' },
    ],
    extra: {
      title: 'Getting trades in',
      body: 'Type them, or import a CSV from your platform. The importer dedupes on symbol, fill times and prices, so re-importing last month’s export won’t double your book. Where your broker reports the real P&L, we keep that number exactly — we don’t recompute it and quietly get contract multipliers wrong.',
    },
    cta: 'Start journaling free',
  },
  {
    slug: 'prop-firm-manager',
    nav: 'Prop Firm Manager',
    eyebrow: 'Track',
    h1: 'Every challenge, every payout, one page.',
    subhead: 'Firm-agnostic by design.',
    intro: ['Track challenges, phase 2s, verifications, funded accounts, PAs and your own live accounts — each with the stage, balance, high-water mark and the risk limits you set.'],
    bullets: [
      { label: 'Account cards grouped by firm, with stage badges and live balances' },
      { label: 'Log a session: P&L, trade count, consecutive losses, rules-followed' },
      { label: 'Track payouts requested vs received, and performance rewards by cycle' },
      { label: 'Record what an attempt cost you, and why an account blew, when it does' },
      { label: 'Scaling cycles and payout planning as plain entries you control' },
    ],
    aside: {
      title: 'The honest part',
      body: 'There is no rule engine here, and that’s deliberate. EagleCapital won’t tell you you’re two days from payout eligibility, because that math is different at every firm and changes without notice. It shows you your numbers, accurately, and leaves the rulebook to you.',
      tone: 'honest',
    },
    cta: 'Add your first account',
  },
  {
    slug: 'trade-copier',
    nav: 'Trade Copier',
    eyebrow: 'Execute',
    h1: 'Trade once. Fill everywhere.',
    subhead: 'Real order copying between your MT4/5 accounts.',
    intro: ['Set a master, add followers, and your orders mirror across accounts in real time. Built on MetaApi’s CopyFactory — real orders, real fills, not a simulation.'],
    bullets: [
      { label: 'Master/follower groups you configure per strategy' },
      { label: 'Live P&L per account, streaming over WebSocket' },
      { label: 'Risk-profile stopouts, with unlock when you’re ready' },
      { label: 'Flatten-all, for the day it’s needed' },
    ],
    aside: {
      title: 'What it doesn’t do',
      body: 'CopyFactory supports MT4 and MT5. Futures platforms — Tradovate, Topstep, Rithmic — are not copyable today and would need a separate execution engine. If your whole book is futures, the copier isn’t for you yet.',
      tone: 'honest',
    },
    extra: {
      title: 'Before you enable it',
      body: 'This tool places real orders on real accounts. Test with the smallest size your broker allows before you trust it with a funded account.',
    },
    cta: 'See supported brokers',
  },
  {
    slug: 'ai-insights',
    nav: 'AI Insights',
    eyebrow: 'Review',
    h1: 'The part of your trading you can’t see.',
    subhead: 'Deterministic pattern detection, plus a coaching digest on demand.',
    intro: ['You already know your win rate. What you don’t know is the shape of your bad days.'],
    bullets: [
      { label: 'Revenge trading', body: 'Trades taken too soon after a loss' },
      { label: 'Overtrading days', body: 'Days well above your own normal volume' },
      { label: 'Size escalation', body: 'Position size climbing after a losing trade' },
    ],
    extra: {
      title: 'The deep layer',
      body: 'When you want the longer read, trigger a coaching digest over any window — 30, 60, 90 days or all-time. It reads your trades, report cards, playbooks and rules together and comes back with pain points, what’s working, and specific actions. Each finding carries its evidence, collapsed until you ask for it. You trigger it. It doesn’t run on a schedule and doesn’t run without you.',
    },
    aside: {
      title: 'The free layer is deterministic',
      body: 'It runs instantly on your own trade log. No API call, no cost, no waiting — and the same trades in give the same answer out, every time. Every flag cites the actual trades behind it. You can go look.',
      tone: 'honest',
    },
    cta: 'See what it finds in your log',
  },
  {
    slug: 'broker-connections',
    nav: 'Broker Connections',
    eyebrow: 'Capture',
    h1: 'Connect the real account.',
    subhead: 'Real balances, real fills, streaming positions.',
    intro: [
      'Link a live MT5 account and EagleCapital pulls real balance and trade history — no CSV, no typing. Open positions stream to the Live Positions page over WebSocket, with unrealized P&L totalled across every connected account.',
      'One broker login often exposes several accounts. Rather than assuming one login equals one account, EagleCapital fetches the real list and lets you choose which to import.',
    ],
    aside: {
      title: 'Credential handling',
      body: 'Broker credentials never go from the browser into storage. They’re submitted straight to an isolated sync service. The app itself reads only connection status, last-synced time and any error.',
      tone: 'honest',
    },
    table: [
      { name: 'MetaTrader 5', status: 'Live. Verified against a real account.', tone: 'live' },
      { name: 'Tradovate', status: 'Built, waiting on a paid Tradovate API plan.', tone: 'blocked' },
      { name: 'MetaTrader 4', status: 'Planned. CopyFactory supports it; sync isn’t wired.', tone: 'planned' },
      { name: 'Topstep', status: 'Planned.', tone: 'planned' },
      { name: 'Rithmic', status: 'Planned.', tone: 'planned' },
      { name: 'Interactive Brokers', status: 'Planned.', tone: 'planned' },
      { name: 'TradeLocker', status: 'Planned.', tone: 'planned' },
      { name: 'DXtrade', status: 'Planned.', tone: 'planned' },
    ],
    extra: {
      title: 'Don’t see yours?',
      body: 'CSV import works with any platform that exports — which is most of them.',
    },
    cta: 'Connect an account',
  },
  {
    slug: 'playbooks',
    nav: 'Playbooks',
    eyebrow: 'Review',
    h1: 'Find out which setups actually work.',
    subhead: 'Document it, attach real trades, read the verdict.',
    intro: ['Write down a setup — context, trigger, invalidation, target. Attach the real trades you took on it. EagleCapital computes the performance from those trades, so the grade comes from your fills, not your memory.'],
    bullets: [
      { label: 'Grade setups A+ through C and watch the grade earn itself' },
      { label: 'Attach reference examples, with screenshots, to any playbook' },
      { label: 'Real stats per setup, computed from linked trades' },
      { label: 'Export a playbook to PDF or Word — for your own records or a prop firm that asks' },
    ],
    cta: 'Build your first playbook',
  },
  {
    slug: 'report-card',
    nav: 'Report Card',
    eyebrow: 'Review',
    h1: 'Grade the trader, not just the account.',
    subhead: 'A daily report card and a rules library that’s yours.',
    intro: ['Accounts tell you what happened. The report card tells you why.'],
    bullets: [
      { label: 'The daily card', body: 'Instrument, session, trades taken, wins, losses, net P&L, largest win, largest loss, max consecutive losses — then a grade, how you were feeling, and a note to tomorrow.' },
      { label: 'The 5 Whys', body: 'Name the problem and ask why five times until you hit the root cause, then write the counter-measure. A process review, not a punishment.' },
      { label: 'Your rules, your checklist', body: 'The execution checklist is generated from the rules you wrote. If your rule is "no trades after three consecutive losses," that’s what you tick against.' },
    ],
    cta: 'Write your rules',
  },
  {
    slug: 'dashboard',
    nav: 'Dashboard',
    eyebrow: 'Track',
    h1: 'The whole book, at a glance.',
    subhead: 'Filter to one account or see all of them together.',
    intro: ['Every number you check first, on one screen — and every chart clickable through to the trades behind it.'],
    bullets: [
      { label: 'KPI row — the numbers you check first' },
      { label: 'Cumulative P&L and daily P&L bars' },
      { label: 'Calendar heatmap — click a day, land in that day’s journal' },
      { label: 'Win rate and profit-factor gauges' },
      { label: 'Average win vs average loss, side by side' },
      { label: 'Trade duration and time-of-day scatters — find your best hour' },
      { label: 'Account balance over time' },
      { label: 'Snapshot the whole dashboard to an image in one click' },
    ],
    cta: 'See your numbers',
  },
  {
    slug: 'market-tools',
    nav: 'Market Tools',
    eyebrow: 'Execute',
    h1: 'Charts and the calendar, without another tab.',
    subhead: 'The two things you keep alt-tabbing to, brought inside.',
    intro: [],
    bullets: [
      { label: 'Charting', body: 'The full TradingView Advanced Chart for any symbol, inside the app. Same tools you already use, next to the trades you already logged.' },
      { label: 'Economic Calendar', body: 'Real structured release data — not an embedded widget. Filter by impact and by currency or instrument, so you see the releases that can move what you actually trade.' },
    ],
    cta: 'Start free',
  },
]

export const FEATURE_LAYERS = [
  { name: 'Track', body: 'Where the accounts and the numbers live.', tools: ['Prop Firm Manager', 'Dashboard', 'Trade Log'] },
  { name: 'Capture', body: 'How trades get in: by hand, by CSV, or straight from your broker.', tools: ['Trade Journal', 'Broker Connections', 'Live Positions'] },
  { name: 'Review', body: 'What you did, whether the setup works, and what to fix tomorrow.', tools: ['AI Insights', 'Playbooks', 'Trader Management'] },
  { name: 'Execute', body: 'Acting on it, across every account at once.', tools: ['Trade Copier', 'Charting', 'Economic Calendar'] },
]

/* ----------------------------------------------------------------- pricing */

export const PRICING_TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    forWho: 'Traders getting their book in order',
    featured: false,
    cta: 'Start free',
    includes: [
      'Unlimited accounts and trades',
      'Full dashboard and analytics',
      'Trade journal, tags, ratings, charts',
      'CSV import',
      'Playbooks with real performance stats',
      'Daily report card and rules library',
      'Pattern detection — revenge, overtrading, size escalation',
      'Economic calendar and charting',
    ],
  },
  {
    name: 'Connected',
    price: 'TBC',
    period: '/month',
    forWho: 'Traders with live broker accounts',
    featured: true,
    cta: 'Join the waitlist',
    includes: [
      'Everything in Free',
      'Connect live broker accounts',
      'Real balance and trade sync',
      'Live position streaming',
      'Monthly coaching digests',
      'Priority support',
    ],
  },
  {
    name: 'Desk',
    price: 'TBC',
    period: '/month',
    forWho: 'Traders running a book across many accounts',
    featured: false,
    cta: 'Join the waitlist',
    includes: [
      'Everything in Connected',
      'Trade Copier — master/follower groups',
      'Unlimited connected accounts',
      'Unlimited coaching digests',
      'Data export',
    ],
  },
]

export const PRICING_FAQ = [
  { q: 'What happens to my data if I downgrade?', a: 'Nothing is deleted. Connected features stop syncing; everything you already logged stays, and stays exportable.' },
  { q: 'Do you take a cut of my profits?', a: 'No. It’s a flat subscription. We’re a tool, not a partner.' },
  { q: 'Can I export and leave?', a: 'Yes. Your data is yours. We’d rather you leave clean than stay stuck.' },
]

/* ---------------------------------------------------------------- security */

export const SECURITY_BLOCKS = [
  { title: 'Row-level security', body: 'Every table is scoped to your user ID with Postgres row-level security — enforced at the database, not hidden in the interface. Another user’s query cannot return your rows even if the app has a bug.' },
  { title: 'Broker credentials', body: 'Credentials never travel from the browser into our storage. They go straight to an isolated sync service that holds them under its own policy. The main app can read only connection status, last-synced time and error text — never the secret itself.' },
  { title: 'AI processing', body: 'The coaching digest runs server-side in an edge function. The provider API key is a server secret and never reaches your browser. Digests run only when you trigger one.' },
  { title: 'Analytics', body: 'Deliberately conservative, because this screen shows real balances and real positions. No session replay. Text and attributes are masked in autocapture. Analytics identify you by user ID only — not email, not name.' },
  { title: 'Error monitoring', body: 'Crash and performance monitoring so we can fix what breaks. Both analytics and error monitoring are optional in our own build and the app runs fully without them.' },
]

export const SECURITY_NEVER = [
  'We don’t sell your data. There is no data business here.',
  'We don’t trade on your data or aggregate it into a signal product.',
  'We don’t share your trades with prop firms. Ever.',
  'We don’t need your broker password to run the free tier.',
]

/* --------------------------------------------------------------------- faq */

export const FAQ = [
  { q: 'Which prop firms does this work with?', a: 'All of them. Genuinely — that’s the design. We don’t encode any firm’s rules, so there’s nothing to support or not support. Pick your firm from the catalogue for the label, or type in one we’ve never heard of. Your risk limits are fields you fill in either way.' },
  { q: 'Which brokers can I actually connect?', a: 'MetaTrader 5 is live and verified against a real account. Tradovate is built and waiting on a paid API plan from Tradovate. Others are planned. CSV import works with any platform that exports — which is most of them.' },
  { q: 'Does the trade copier work with futures accounts?', a: 'No. Copying runs on CopyFactory, which is MT4/5 only. You can track and sync futures accounts, but not copy between them. Futures copying would need its own execution engine and isn’t built.' },
  { q: 'Will this tell me when I’m close to breaching?', a: 'It shows you your numbers against the limits you entered. It won’t compute your firm’s rules for you, because every firm’s math differs and firms change terms without notice. A tool that’s confidently wrong about your drawdown is more dangerous than one that isn’t.' },
  { q: 'Is the AI going to tell me what to trade?', a: 'No. It reviews what you already did. Pattern detection flags revenge trading, overtrading and size escalation from your own log. The coaching digest reviews your behaviour. Neither gives entries, and neither is financial advice.' },
  { q: 'Do I have to use the AI features?', a: 'No. Pattern detection is free and runs locally on your data. The coaching digest only runs when you click it.' },
  { q: 'Can I import my history from another journal?', a: 'If it exports CSV, most likely. The importer handles MT4/5-style exports and dedupes on fill time and price, so trial and error is safe.' },
  { q: 'What happens if I import the same file twice?', a: 'Nothing bad. Duplicates are detected on symbol, entry and exit times and prices, and skipped. You’ll be told how many were imported and how many skipped.' },
  { q: 'Is my P&L recalculated?', a: 'Only when it has to be. If your broker’s export reports the real P&L, we keep that figure exactly — recomputing it would get contract multipliers wrong on some instruments. Manually entered trades are computed, since there’s no authoritative source.' },
  { q: 'Is there a mobile app?', a: 'Not yet. The web app works on mobile browsers; a proper mobile experience is on the roadmap.' },
  { q: 'Can I use this with a partner or a team?', a: 'Today it’s built for one trader. Each account is fully isolated at the database level.' },
  { q: 'Is this financial advice?', a: 'No. It’s a tracking and journaling tool. Every risk decision is yours.' },
]

/* ----------------------------------------------------------------- roadmap */

export const ROADMAP = [
  { stage: 'In progress', items: ['Broader broker coverage — MT4 sync, then futures platforms', 'Tradovate, once the API plan is in place'] },
  { stage: 'Next', items: ['Data export — your whole book, one file', 'Deep links, so you can bookmark a trade or an account', 'Progress-vs-plan projections', 'A real mobile experience'] },
  { stage: 'Considering', items: ['Alerts and notifications', 'Futures copying — needs its own execution engine', 'OAuth sign-in'] },
  { stage: 'Shipped', items: ['Live MT5 sync', 'Trade Copier', 'Live position streaming', 'AI Insights', 'Playbooks', 'Report Card', 'CSV import'] },
]

/* ------------------------------------------------------------------- legal */

export const FOOTER_DISCLAIMER =
  'EagleCapital is a tracking and journaling tool, not financial advice and not a substitute for your own risk judgment. No prop firm’s rules or risk calculations are encoded in this product. The Trade Copier places real orders on real accounts you connect. Trading carries risk of loss.'

export const DISCLAIMER_BODY = [
  'EagleCapital is a trade-tracking and journaling tool. It is not financial advice, not investment advice, and not a substitute for your own risk judgment.',
  'No prop firm’s rules, limits or risk calculations are encoded in this product. Every risk figure you see is one you entered yourself or one reported by a broker you connected. We do not verify these figures against any firm’s terms, and we make no representation that your account complies with any firm’s rules.',
  'The Trade Copier places real orders on real trading accounts you connect. You are responsible for every order it places. Test it with minimal size before using it on a funded account.',
  'Trading carries a substantial risk of loss and is not suitable for everyone. Past performance does not indicate future results. You may lose more than your initial deposit on leveraged products.',
  'EagleCapital is not affiliated with, endorsed by, or partnered with any prop firm or broker named in this product.',
]

/* Privacy and Terms.
 *
 * Written to describe what the code actually does, in the same way the broker
 * support table is (see the note in CLAUDE.md). If a data flow changes — a new
 * sub-processor, a new bucket, a new thing sent to an LLM — this is the place
 * that has to change with it.
 *
 * Not lawyer-reviewed. Accurate, but get it checked before you take money. */

export interface LegalSection {
  heading: string
  paragraphs: string[]
}

export const PRIVACY_UPDATED = '10 September 2026'

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: 'What we collect',
    paragraphs: [
      'An email address and a password, so you can sign in. Passwords are hashed by our authentication provider and are never visible to us.',
      'Everything you choose to log: trading accounts and their sizes and limits, trades, sessions, payouts, rewards, playbooks, trading rules and daily report cards. You type this in, or import it from a CSV, or sync it from a broker account you connect.',
      'Images you upload to playbooks and report cards.',
      'Basic product analytics — which pages you open and which actions you take — identified by your user ID. No session replay, and no third-party advertising or tracking pixels.',
      'Error diagnostics when something breaks, so we can fix it.',
    ],
  },
  {
    heading: 'How your data is separated',
    paragraphs: [
      'Every table is protected by row-level security scoped to your authenticated user ID. That check runs in the database, not in the app, so one user\u2019s query cannot return another user\u2019s rows even if the front-end asks it to.',
    ],
  },
  {
    heading: 'Who else processes it',
    paragraphs: [
      'Supabase — database, authentication and file storage. This is where your data lives.',
      'Groq and Anthropic — only when you press "Generate Insights" on the AI Insights page. That sends a summary of the trades in the range you selected to a language model to write the digest. Nothing is sent automatically, and nothing is sent unless you press the button. If you never use that page, your trades never reach either provider.',
      'PostHog — product analytics, keyed to your user ID.',
      'Sentry — error monitoring.',
      'We do not sell your data, and we do not share it with prop firms or brokers.',
    ],
  },
  {
    heading: 'Images you upload',
    paragraphs: [
      'Playbook and report-card images are stored under a randomly generated address in a bucket that serves files over public URLs. The address is not guessable and is not listed anywhere, but anyone you give the link to can open the image without signing in. Treat these the way you would treat an unlisted link: fine for a chart screenshot, not the place for anything you would not want forwarded.',
    ],
  },
  {
    heading: 'Broker credentials',
    paragraphs: [
      'If you connect a broker account, the credentials are used to establish that connection and are not written into our own database tables from the browser. We never ask for a password to an account you have not chosen to connect, and connecting a broker is always optional — the journal, dashboard and prop tracker work entirely without one.',
    ],
  },
  {
    heading: 'Getting your data out, and deleting it',
    paragraphs: [
      'Settings has two exports: your trades as a CSV, and everything as JSON. Neither costs anything and neither is gated behind a plan.',
      'The same page deletes every record you have logged. Deletion is immediate and cannot be undone, so export first if you want a copy. Reclaiming the underlying login record is a manual step on our side today — ask and we will remove it.',
      'You can do both without talking to us, and we would rather you left cleanly than stayed because leaving was hard.',
    ],
  },
  {
    heading: 'Cookies',
    paragraphs: [
      'A session cookie keeps you signed in. Analytics use a first-party identifier. There are no advertising cookies and nothing is shared with an ad network.',
    ],
  },
]

export const TERMS_UPDATED = '10 September 2026'

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: 'What this service is',
    paragraphs: [
      'EagleCapital records and analyses trading activity you enter or connect. It is a record-keeping and review tool. It is not financial advice, not investment advice, not a broker, and not a substitute for your own judgment.',
    ],
  },
  {
    heading: 'Your account',
    paragraphs: [
      'You are responsible for keeping your password secure and for everything done through your account. Tell us promptly if you believe someone else has access to it.',
      'You must be old enough to enter a contract where you live, and you must not use the service where doing so would break local law.',
    ],
  },
  {
    heading: 'Your data belongs to you',
    paragraphs: [
      'You keep ownership of everything you log. You grant us only the permission needed to store it, show it back to you, and operate the features you use.',
      'You can export it or delete it at any time from Settings.',
    ],
  },
  {
    heading: 'No prop firm rules are encoded',
    paragraphs: [
      'The product does not implement, verify or enforce any prop firm\u2019s rules. Drawdown limits, daily loss limits, profit targets and trading-day requirements are values you type in yourself. We do not check them against any firm\u2019s terms, and passing or failing an evaluation is between you and that firm.',
    ],
  },
  {
    heading: 'The Trade Copier places real orders',
    paragraphs: [
      'When you enable copying, the service submits real orders to real accounts you have connected. You are responsible for every order placed. Test with minimal size before pointing it at a funded account.',
      'Order routing depends on your broker, your connection and third-party systems. Orders can be delayed, rejected or filled at prices you did not expect. We do not guarantee that any order is placed, placed on time, or placed at any particular price.',
    ],
  },
  {
    heading: 'Availability',
    paragraphs: [
      'The service is provided as-is. We do not promise it will be uninterrupted or error-free, and features may change. We will not intentionally remove your ability to export your own data.',
    ],
  },
  {
    heading: 'Limitation of liability',
    paragraphs: [
      'To the fullest extent the law allows, we are not liable for trading losses, lost profits, missed opportunities, or any indirect or consequential loss arising from your use of the service — including losses connected to an order the Trade Copier placed or failed to place.',
      'Nothing here limits liability that cannot be limited by law.',
    ],
  },
  {
    heading: 'Payment',
    paragraphs: [
      'The free tier is free. Paid tiers are not yet available and nothing is charged today. If that changes, prices and terms will be published before anyone is billed.',
    ],
  },
  {
    heading: 'Ending your use',
    paragraphs: [
      'You can stop at any time and delete your data from Settings. We may suspend an account that is being used to break these terms or the law.',
    ],
  },
  {
    heading: 'Not affiliated',
    paragraphs: [
      'EagleCapital is not affiliated with, endorsed by, or partnered with any prop firm or broker named anywhere in this product.',
    ],
  },
]
