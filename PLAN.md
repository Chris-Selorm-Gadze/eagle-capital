# EagleCapital (prop-tracker) — Build Plan

A local-first dashboard tracking Chris's prop accounts across FundedNext (CFD) and Apex (futures, 4× 250K legacy). Companion to `FundedNext_600K_Scaling_Plan.xlsx` — the spreadsheet is the plan, this app is the daily cockpit.

**Stack:** Vite + React + TypeScript, Dexie (IndexedDB) for storage, Papaparse for CSV import, Recharts for charts. No backend, no accounts, no server — runs in the browser, data stays on your machine.

**Golden rule:** all firm rule constants and calculations live in `src/domain/` with source URLs, and every rule has a test. The UI never hardcodes a number.

---

## Milestone 0 — Repo setup (15 min) ✅ mostly done by this scaffold

```bash
cd prop-tracker
npm install
npm test          # domain rules must be green before anything else
npm run dev       # http://localhost:5173
git init && git add -A && git commit -m "scaffold: domain rules + data layer"
gh repo create prop-tracker --private --source=. --push
```

Acceptance: all tests pass, dev server shows the seeded 9 accounts with risk numbers matching the Excel Risk Management tab (15K FN: $90/trade, $225 daily stop; Apex 250K: $650/trade, $1,950 daily stop).

## Milestone 1 — Account cards (the "don't blow up" screen)

Replace the table in `App.tsx` with one card per account showing: stage badge, balance, **room to trail/drawdown** (big, color-coded: green > 50% of DD, amber 30–50%, red < 30%), cushion vs target (eval) or vs payout minimum (PA), and today's limits (risk/trade, daily stop, max trades).

> Claude Code prompt: "Read PLAN.md and src/domain/. Build Milestone 1: replace the App.tsx table with responsive account cards grouped by firm. Use only functions from src/domain — no inline rule math. Add an edit dialog to update balance/highestBalance/stage per account via Dexie."

Acceptance: entering balance 252,000 / highest 258,000 on an Apex eval shows room = $500 in red.

## Milestone 2 — Daily session log + circuit breakers

Form per account per day: P&L, number of trades, consecutive losses, highest unrealized balance, rules-followed checkbox, notes. On save: update account balance/highestBalance. Show a breaker banner from `circuitBreaker()`: ok / 30-min break / done-for-day / flat-for-week. A "done-for-day" on any Apex account flags ALL Apex accounts (copier risk).

Acceptance: logging 3 consecutive red days shows flat-for-week; test IDs on banner states.

## Milestone 3 — Payout planner

Per Apex PA account: run `checkPayout()` and render the gate checklist (8 days, 5×$50 days, safety net, windfall) with the exact dollar amounts missing. Windfall helper: "biggest day ÷ 0.3 = min profit needed." Per FundedNext account: cycle tracker — log each performance reward with % growth, count qualifying (≥4%) cycles, show Pro countdown (61-day clock via `proEligible()`), and next scaled size via `scaledSize()`.

Acceptance: matches the worked examples in the test files.

## Milestone 4 — CSV import

Import Tradovate performance CSV / Rithmic order export → daily session rows (dedupe on account+date). FundedNext stays manual (no API/export worth parsing). Store raw file hash to prevent double-import.

> Claude Code prompt: "Implement Milestone 4. Ask me for a sample CSV export first — do not guess column names."

## Milestone 5 — Progress vs plan

Recharts: equity curve per account (from sessions); funded-capital-over-time chart with the three Excel scenario lines (conservative/base/aggressive — copy the monthly numbers from the Projection tab into `src/domain/scenarios.ts`) vs actual.

## Milestone 6 — Backup + polish

JSON export/import of the whole Dexie DB (one click, dated filename). Deploy static build to Vercel/GitHub Pages if you want it on your phone (PWA manifest). Data never leaves the browser either way.

---

## Later / maybe
- Tradovate API sync (replaces Milestone 4 manual import for Apex)
- Notifications: payout-eligible dates, FN Pro eligibility date
- Trade-level journal with screenshots

## Non-goals
- Multi-user, auth, cloud sync, order execution. This is a cockpit, not a broker.
