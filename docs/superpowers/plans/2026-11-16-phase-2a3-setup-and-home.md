# Phase 2a-3: First-Run Setup and Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- **Home becomes the dashboard:** a widget registry plus a saved layout that starts from the user's plan template. For the owner that means weekly spending left, the latest paycheck's tasks, the plan, goals, upcoming bills and income, spending by category, needs attention, and recent transactions, all from records with no typing.
- **A short, skippable first-run setup** gets a new user from nothing to a working Home.
- **This completes Phase 2a's "done when".**

**Architecture:**
- **Widget types are code, layouts are data.** The widget registry (`src/server/home/registry.ts`) defines, for each type:
  - key, title, and a Zod settings schema with defaults;
  - allowed sizes;
  - a server data loader.
- **Components live beside it** (`src/components/home/widgets/*`).
- **Layouts:**
  - Starting layouts are data in `src/server/home/layouts.ts`, keyed by plan template and cadence.
  - A user's layout is stored in `dashboards` / `dashboard_widgets`, so editing in 2b (and the assistant's `add_widget`) can change it.
- **Setup progress is derived from records** (start date set, an account exists, …) plus a list of skipped steps; there is no separate progress state to drift.

**Tech Stack:** Phase 2a-2 stack. No new dependencies (charts stay CSS bars; Recharts can come with trend charts in Phase 4).

**Spec:** `docs/superpowers/specs/2026-11-15-finnance-design.md`. Sections:
- 1 (Guiding principle);
- 6, "Dashboard and modules";
- 7.5 (cold start);
- 8.2 (modular dashboard);
- 10, "Home";
- 13, "First-run setup" and the default dashboard for the Paycheck plan;
- 15 (the number that matters is biggest; empty states point to the next action);
- 16, the Phase 2a "done when".

## Global Constraints

- **Earlier phases' constraints still apply.** Everything in Phase 1a–2a-2's Global Constraints:
  - read the bundled Next docs before writing Next code;
  - money in integer cents and calendar dates as `YYYY-MM-DD` strings;
  - `userId`-scoped services;
  - Server Actions call `requireUser()` and validate with Zod;
  - an activity-log row on every change;
  - migrations are add-only;
  - no real bank data in the repo;
  - no real API calls in tests.
- **The guiding principle, applied:**
  - Widgets show records and point to the next action; none needs a schedule or a specific plan shape to render.
  - Widget settings reference building blocks by id (a bucket, a goal). A missing or stale reference falls back gracefully.
  - Starting layouts are data per template; nothing outside `layouts.ts` names the owner's widget order.
  - Setup is optional, every step can be skipped, and it never blocks the app.
- **The owner's default Home** (spec 13), in this order:
  1. Weekly spending left (large);
  2. Paycheck tasks;
  3. Plan overview;
  4. Goals;
  5. Upcoming bills and income;
  6. Spending by category;
  7. Needs attention;
  8. Recent transactions.
- **Layout grid:** sizes `sm | md | lg | full` map to 12-column spans `3 | 6 | 8 | 12` on desktop (≥ `lg` breakpoint); on mobile everything is one column in order.
- **2a Home is fixed** (spec 16): no edit mode. A dashboard row has `customized boolean default false`. While it is false, the stored layout is regenerated whenever its layout key (template, plus cadence, plus "no plan") changes.
- **Cold start** (spec 7.5): comparisons ("vs. last month") are hidden until a full previous month of tracking exists. The first month shows "Your first month" framing.
- **Carry-overs folded in** (`phase-2a2-deferred-review-items`):
  - item 3: `fundedByBucketName` is always loaded;
  - item 4: a reached goal with no follow-on goal also prompts "Mark it done?";
  - item 9: the goals total excludes debt payoff.
- **Out of scope:**
  - dashboard edit mode, the full catalog (Income received vs. expected, Subscriptions total, Quick add), and feature modules (2b);
  - setup by conversation (2b);
  - charts libraries.
- **Shorthand tests:** a test shown with a `/* … */` body states its exact setup and assertion. Write it out with the existing helpers (`createTestUser`, `createAccount`, `insertTestTransaction`, `commitImport` + `fixtureBytes`, `setTrackingStartDate`, `createIncomeSource`, `createRecurringRule`, `createPlan` + `templateDrafts`, `createGoal`, `ownerPlan` / `transferPair` from `src/server/goals/test-helpers.ts`).
- Pushing or merging needs the owner's go-ahead at execution time.

## Review Focus

1. **A brand-new user.** With no start date, accounts, income, or plan, Home is not blank and never errors. It shows a "Finish setting up" card and widgets whose empty states say what to do next. → Task 4 `a new user gets a useful Home`; Task 6 e2e `walks a new user through setup`.
2. **The owner, who already has data.** Setup shows those steps done, never forces a redirect, and the Home layout matches spec 13's order. → Task 4 `the owner's Home follows the spreadsheet's order`; Task 5 `setup knows what's already done`.
3. **Households unlike the owner's.**
   - A monthly plan, or a gig worker's per-income plan, gets a layout without "Paycheck tasks" or "weekly" assumptions.
   - "Weekly spending left" appears only when a bucket has a weekly limit; otherwise the bucket widget picks the first bucket with any limit, or is left out.
   → Task 4 `other households get layouts that fit them`.
4. **Stale widget settings.** A widget pointing at a deleted bucket or goal falls back (first suitable bucket, top goals) rather than crashing or rendering blank. → Task 3 `widgets survive deleted buckets and goals`.
5. **Spending by category.** Transfers, transfer-kind categories, hidden rows, and income are excluded. The first month shows no misleading "vs. last month". → Task 3 `spending by category counts only real spending`, `hides comparisons in the first month`.

---

## File Structure

```
src/server/goals/overview.ts (+tests)          (modify) carry-overs
src/server/db/finance-schema.ts                (modify) dashboards, dashboard_widgets; user_settings.setup_skipped
src/server/home/
  insights.ts (+test)                          getSpendingByCategory, getUpcoming, getNeedsAttention
  registry.ts (+test)                          WIDGETS registry (key, title, schema, sizes, loader)
  layouts.ts                                   starting layouts (data)
  dashboard-service.ts (+test)                 ensureHomeDashboard, loadHome
  setup-service.ts (+test)                     getSetupStatus, skipSetupStep, COMMON_SUBSCRIPTIONS
src/app/(app)/page.tsx                         (replace) Home
src/components/home/{home-grid.tsx,widget-frame.tsx,widgets/*}
src/app/(app)/setup/{page.tsx,actions.ts}      + src/components/setup/*
e2e/home.spec.ts, e2e/setup.spec.ts; e2e/shell.spec.ts, e2e/global-setup.ts, e2e/fixtures.ts (modify)
docs/setup.md, README.md (modify)
```

---

### Task 1: Goals carry-overs (Phase 2a-2 deferred items 3, 4, 9)

**Files:**
- Modify: `src/server/goals/overview.ts`, `overview.test.ts`, `src/components/goals/goal-card.tsx`

**Interfaces:**
- Produces behavior changes only:
  - `GoalView.fundedByBucketName` is set whenever `funded_by_bucket_id` points to an existing bucket. The plan is loaded whenever any goal has a funding bucket.
  - A new field `GoalView.askDone: boolean`: true when the goal is reached and still `active`, whether or not `rollOverTo` is set.
  - `GoalCard` shows the banner whenever `askDone`:
    - with `rollOverTo`: "Reached! Mark it done so what comes next goes to {next}.";
    - without: "Reached! Mark it done."
  - `totalSavedCents` excludes `debt_payoff` goals.

- [ ] **Step 1: Write the failing tests** (`overview.test.ts`)

```ts
it("names the funding bucket even when the goal has its own plan", async () => {
  /* ownerPlan; goal fundedBy Savings & investing with plannedCents 30000 per month →
     fundedByBucketName "Savings & investing", plannedBasis "set". */
});
it("asks to mark a reached goal done even with nothing after it", async () => {
  /* a single goal, target 50000, starting 60000 → askDone true, rollOverTo null. */
});
it("leaves debt payoff out of the saved total", async () => {
  /* savings goal starting 10000 and debt_payoff goal starting 50000 → totalSavedCents 10000. */
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/goals/overview.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**, then run the same command.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "fix: goals name their funding bucket, ask to mark done, and keep debt out of savings"
```

---

### Task 2: Schema and migration

**Files:**
- Modify: `src/server/db/finance-schema.ts`
- Create: migration `drizzle/0007_*.sql` (generated)

**Interfaces:**
- Produces:
  - `WidgetSize = "sm" | "md" | "lg" | "full"`.
  - **`dashboards`:**
    - `id, user_id, name text not null default 'Home'`;
    - `is_default boolean not null default true`;
    - `layout_key text not null`;
    - `customized boolean not null default false`;
    - timestamps;
    - unique `(user_id) where is_default`.
  - **`dashboard_widgets`:**
    - `id, user_id`, `dashboard_id → dashboards cascade`;
    - `type text not null`, `config jsonb not null default '{}'`, `size text not null`;
    - `position int not null`;
    - timestamps;
    - index `(dashboard_id, position)`.
  - **`user_settings.setup_skipped`:** `text[] not null default '{}'`.

- [ ] **Step 1: Implement; generate and apply**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: `drizzle/0007_*.sql` contains only `CREATE TABLE`, `ALTER TABLE … ADD COLUMN`, `CREATE [UNIQUE] INDEX`, and FK constraints.

- [ ] **Step 2: Verify**

Run: `pnpm vitest run && pnpm typecheck`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: dashboard and widget tables; skipped setup steps"
```

---

### Task 3: Home insights and the widget registry

**Files:**
- Create: `src/server/home/insights.ts`, `insights.test.ts`, `registry.ts`, `registry.test.ts`

**Interfaces:**
- Consumes:
  - `getPlanStatus`, `getGoalsOverview`, `getRecurringOverview`, `listTransactions`;
  - `countNeedsReview`, `countUnsorted`, `listSuggestions`;
  - `getSettings`, `monthWindow`, `addMonths`, `todayInTimeZone`.
- Produces (`insights.ts`):
  - **`getSpendingByCategory(db, userId, now?: Date): Promise<{ month: string; firstMonth: boolean; totalCents: number; previousTotalCents: number | null; rows: { categoryId: string | null; name: string; cents: number }[] }>`**
    - **Counts:** spending this calendar month.
    - **Excluded:** transfer-paired rows, rows in a transfer-kind category, hidden rows, and money in (amount > 0). Refunds (positive in an expense category) reduce their category.
    - **Rows:** uncategorized rows group as "Uncategorized". Rows are sorted by cents, descending, then name.
    - **Cold start:** `firstMonth` is true when the tracking start date falls in this month or in the previous month after its 1st. Then `previousTotalCents` is null; otherwise it is last month's total.
  - **`getUpcoming(db, userId, now?: Date, days = 14): Promise<{ kind: "income" | "bill" | "subscription" | "transfer"; name: string; date: string; amountCents: number | null }[]>`**
    - the `nextDate`s within `[today, today + days]` from `getRecurringOverview`, active items only;
    - sorted by date, then name.
  - **`getNeedsAttention(db, userId, now?: Date): Promise<{ key: string; text: string; href: string }[]>`**, in this order, each only when it applies:
    - `review`: "{n} transactions need a look" → `/transactions/review`;
    - `unsorted`: "{n} transactions haven't been sorted yet" → `/transactions/review`;
    - `late`: "{name} is late (expected {date})" for each late item → `/recurring`;
    - `awaiting`: "Import your latest files — {n} expected items aren't in yet" → `/import`;
    - `suggestions`: "{n} repeating charges you might want to track" → `/recurring`;
    - `goal_done`: "{goal} reached its target" for each `askDone` goal → `/goals`;
    - `plan`: "Your plan has no income" when `problem === "no_income"` → `/plan`.
- Produces (`registry.ts`; data loaders are server-only and the module is never imported client-side):
  - `type WidgetType = "setup" | "bucket_status" | "paycheck_tasks" | "plan_overview" | "goals" | "upcoming" | "spending_by_category" | "needs_attention" | "recent_transactions"`
  - `type WidgetDef<S, D> = { key: WidgetType; title: string; sizes: WidgetSize[]; settings: z.ZodType<S>; defaults: S; load(db: Database, userId: string, settings: S, now: Date): Promise<D> }`
  - `WIDGETS: Record<WidgetType, WidgetDef<any, any>>`, with these settings and loader data:

    | Widget | Settings (Zod, defaults) | Loader returns |
    |---|---|---|
    | `setup` | `{}` | `getSetupStatus` (Task 5) |
    | `bucket_status` | `{ bucketId: string \| null }` | the `BucketView` |
    | `paycheck_tasks` | `{}` | the `PlanStatus` slice `{ cadence, latestIncome, month, tasks, nextExpected, problem }`, or null without a plan |
    | `plan_overview` | `{}` | `{ buckets, health, typicalIncomeCents, cadence }`, or null |
    | `goals` | `{ goalId: string \| null; limit: number = 3 }` | that goal, or the top `limit` goals by priority (not archived) |
    | `upcoming` | `{ days: number = 14 }` | `getUpcoming` |
    | `spending_by_category` | `{}` | `getSpendingByCategory` |
    | `needs_attention` | `{}` | `getNeedsAttention` |
    | `recent_transactions` | `{ limit: number = 8 }` | the newest rows from `listTransactions` |

    `bucket_status` fallback order when `bucketId` is null or missing: the first bucket with a weekly limit, then the first with any limit, then null.
  - **`loadWidget(db, userId, w: { type: string; config: unknown }, now): Promise<{ type: WidgetType; data: unknown } | null>`**
    - parses `config` with the type's schema, falling back to the defaults on failure;
    - returns null for an unknown type.

- [ ] **Step 1: Write the failing tests**

```ts
// insights.test.ts — start 2026-11-01; checking + Ally Savings; now 2026-11-20T18:00Z.
it("spending by category counts only real spending", async () => {
  /* Rows (with categories): Coffee -625, Coffee +125 refund, Groceries -4500, a transfer pair 40000, a row in category Transfer -1000,
     a hidden Coffee row -9000, Paycheck +120000, an uncategorized -300 → rows [Groceries 4500, Coffee 500, Uncategorized 300], totalCents 5300. */
});
it("hides comparisons in the first month", async () => {
  /* start 2026-11-01 → firstMonth true, previousTotalCents null. Start 2026-09-15 with October spending 7000, now 2026-11-20 →
     firstMonth false, previousTotalCents 7000. */
});
it("lists what's coming in the next two weeks", async () => {
  /* paycheck biweekly anchor 2026-11-14 fixed 120000; Netflix monthly anchor 2026-11-25 1549; a paused bill on 11-22 →
     [{ kind: "subscription", name: "Netflix", date: "2026-11-25", amountCents: 1549 }, { kind: "income", name: "Paycheck", date: "2026-11-28", amountCents: 120000 }]. */
});
it("collects what needs attention, with where to go", async () => {
  /* an imported row needing review, a late bill, a reached goal → keys ["review", "late", "goal_done"] with hrefs
     "/transactions/review", "/recurring", "/goals". */
});
// registry.test.ts
it("widgets survive deleted buckets and goals", async () => {
  /* ownerPlan; loadWidget({ type: "bucket_status", config: { bucketId: "gone" } }) → the "Weekly spending" bucket;
     loadWidget({ type: "goals", config: { goalId: "gone", limit: 2 } }) → the top 2 goals;
     loadWidget({ type: "nope", config: {} }) → null; loadWidget({ type: "upcoming", config: { days: "x" } }) → loads with days 14. */
});
it("a bucket widget picks a bucket that has a limit", async () => {
  /* a monthly plan with Rent (no limit) and Groceries (monthly limit) → bucket_status loads Groceries; a plan with no limits → data null. */
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/home`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** `insights.ts` and `registry.ts`, then run the same command.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: home insights (spending by category, upcoming, needs attention) and the widget registry"
```

---

### Task 4: Starting layouts and the Home dashboard service

**Files:**
- Create: `src/server/home/layouts.ts`, `dashboard-service.ts`, `dashboard-service.test.ts`

**Interfaces:**
- Produces (`layouts.ts`, data):
  - **`type LayoutWidget = { type: WidgetType; size: WidgetSize; config?: Record<string, unknown> }`**
  - **`STARTING_LAYOUTS: Record<string, LayoutWidget[]>`**, keyed by layout key:

    | Key | Widgets, in order |
    |---|---|
    | `paycheck_plan` | bucket_status `lg`, paycheck_tasks `sm`, plan_overview `full`, goals `md`, upcoming `md`, spending_by_category `md`, needs_attention `md`, recent_transactions `full` |
    | `per_income` (custom per-income plans) | paycheck_tasks `md`, plan_overview `md`, goals `md`, upcoming `md`, spending_by_category `md`, needs_attention `md`, recent_transactions `full` |
    | `monthly` | plan_overview `full`, goals `md`, upcoming `md`, spending_by_category `md`, needs_attention `md`, recent_transactions `full` |
    | `none` (no plan) | needs_attention `md`, upcoming `md`, goals `md`, spending_by_category `md`, recent_transactions `full` |

  - **`layoutKeyFor(plan: { template: PlanTemplate; cadence: PlanCadence } | null): string`**
    - the template key when `STARTING_LAYOUTS` has it, else the cadence;
    - `none` without a plan.
- Produces (`dashboard-service.ts`):
  - **`ensureHomeDashboard(db, userId): Promise<{ dashboardId: string; widgets: { id: string; type: string; config: unknown; size: WidgetSize }[] }>`**
    - creates the default dashboard from `STARTING_LAYOUTS[layoutKeyFor(active plan)]` when missing;
    - when it is not `customized` and its `layout_key` differs from the current key, replaces its widgets with the new layout (activity `dashboard.reset`);
    - returns widgets by position.
  - **`loadHome(db, userId, now?: Date): Promise<{ widgets: ({ id: string; size: WidgetSize; type: WidgetType; data: unknown })[]; setupIncomplete: boolean }>`**
    - runs `ensureHomeDashboard`, then `loadWidget` for each (dropping nulls);
    - when setup is incomplete (Task 5's `getSetupStatus().complete === false`), prepends a `setup` widget sized `full` that isn't stored.
  - **Activity:** `dashboard.create`, `dashboard.reset`.
- Task 5's `getSetupStatus` is consumed through the registry. Task 4 tests stub nothing: they create users whose setup is complete or not.

- [ ] **Step 1: Write the failing tests**

```ts
it("the owner's Home follows the spreadsheet's order", async () => {
  /* ownerPlan → ensureHomeDashboard widget types in order: bucket_status, paycheck_tasks, plan_overview, goals, upcoming,
     spending_by_category, needs_attention, recent_transactions; the first is size "lg". A second call returns the same widget ids. */
});
it("other households get layouts that fit them", async () => {
  /* a custom monthly plan → types [plan_overview, goals, upcoming, spending_by_category, needs_attention, recent_transactions] (no paycheck_tasks, no bucket_status);
     a custom per-income plan → starts with paycheck_tasks; no plan → layout "none". */
});
it("follows the plan until the layout is customized", async () => {
  /* no plan → layout "none"; createPlan(paycheck) → the next ensureHomeDashboard has layoutKey "paycheck_plan" and bucket_status first;
     set customized true, deletePlan → the layout stays. */
});
it("a new user gets a useful Home", async () => {
  /* brand-new user (no start date) → loadHome widgets start with "setup", setupIncomplete true, and every other widget loads without
     throwing (needs_attention [], upcoming [], goals [], recent_transactions []). */
});
it("isolates users", async () => { /* B's dashboard and widgets are separate; loadHome(B) never includes A's rows. */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/home/dashboard-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**, then run `pnpm vitest run src/server/home && pnpm typecheck`.
Expected: PASS. If Task 5 isn't done yet, implement `getSetupStatus` first as the minimal Task 5 Step 3 and keep Task 5's tests for Task 5.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: starting Home layouts per plan, stored as a dashboard"
```

---

### Task 5: Setup status (derived) and skipping

**Files:**
- Create: `src/server/home/setup-service.ts`, `setup-service.test.ts`

**Interfaces:**
- Produces:
  - `type SetupStepKey = "start_date" | "accounts" | "income" | "plan" | "bills" | "goals"`
  - **`getSetupStatus(db, userId): Promise<{ steps: { key: SetupStepKey; title: string; done: boolean; skipped: boolean; href: string }[]; complete: boolean; nextStep: SetupStepKey | null }>`**
    - **Done when:**
      - `start_date`: a tracking start date is set;
      - `accounts`: 1 or more unarchived accounts;
      - `income`: 1 or more income sources;
      - `plan`: an active plan;
      - `bills`: 1 or more recurring rules;
      - `goals`: 1 or more goals.
    - `complete` = every step is done or skipped.
    - Titles: "Choose your start date", "Add your accounts", "Add your income", "Make your plan", "Add bills and subscriptions", "Add your goals". The hrefs are `/setup?step={key}`.
  - **`skipSetupStep(db, userId, key: SetupStepKey): Promise<void>`** and `unskipSetupStep`: add to or remove from `user_settings.setup_skipped`, with activity `setup.skip` / `setup.unskip`.
  - **`COMMON_SUBSCRIPTIONS: { name: string; cents: number; matchPattern: string }[]`** (typical US prices, editable when added):
    - Netflix 1549;
    - Spotify 1199;
    - Hulu 999;
    - Disney+ 1599;
    - YouTube Premium 1399;
    - Amazon Prime 1499;
    - Apple iCloud+ 299;
    - Max 1699;
    - Peacock 799;
    - Paramount+ 799.

- [ ] **Step 1: Write the failing tests**

```ts
it("setup knows what's already done", async () => {
  /* user with start date, 2 accounts, a paycheck, and a plan → start_date/accounts/income/plan done; bills, goals not; complete false;
     nextStep "bills". skipSetupStep("bills"), add a goal → complete true, nextStep null. */
});
it("a brand-new user starts at the start date", async () => { /* nothing → every step not done, nextStep "start_date". */ });
it("skipping can be undone", async () => { /* skip "goals" → skipped true; unskip → false. */ });
it("isolates users", async () => { /* B's skips don't affect A. */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/home/setup-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**, then run `pnpm vitest run src/server/home`.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: first-run setup status derived from your records, with skippable steps"
```

---

### Task 6: The Home page

**Files:**
- Replace: `src/app/(app)/page.tsx`
- Create: `src/components/home/{home-grid.tsx,widget-frame.tsx}` and `src/components/home/widgets/{setup-card,bucket-status,paycheck-tasks,plan-overview,goals-widget,upcoming,spending-by-category,needs-attention,recent-transactions}.tsx`
- Modify: `e2e/shell.spec.ts` (drop the `/` placeholder row), `e2e/global-setup.ts`, `e2e/fixtures.ts`
- Create: `e2e/home.spec.ts`

**Interfaces:**
- Consumes: `loadHome`; existing presentational pieces where they fit (`BucketCard`, the income card's task list, `GoalCard`'s numbers); `formatCents`, `formatDisplayDate`.
- Produces:
  - **The page.** `PageHeader` "Home", with a description by time of day ("Good morning" / "Good afternoon" / "Good evening" in the user's timezone), then `HomeGrid`.
  - **`HomeGrid`** renders `widget-frame`s in a `grid grid-cols-1 lg:grid-cols-12 gap-4`, with spans `sm 3`, `md 6`, `lg 8`, `full 12` (`lg:col-span-*`).
  - **`WidgetFrame`** (a `section` with `aria-label` = widget title): a title row, a body, and an optional "See all →" link.
- **Widgets** (each empty state says what to do next):
  - **`setup`:** "Finish setting up" with the steps as a checklist (links), plus "{done} of 6".
  - **`bucket_status`:**
    - the big "{remaining} left {this week | this month | since your last income}";
    - "resets {weekday}";
    - the bucket name;
    - a bar.
    - Without data: "Make a plan to see what's left to spend" → `/plan`.
  - **`paycheck_tasks`:** the latest income (or month) and its move tasks with checks. Empty states: "Waiting for your first income" / "Make a plan" → `/plan`.
  - **`plan_overview`:** a compact row per bucket (name, remaining or moved, a thin bar) and the health chip. Empty: "Make a plan" → `/plan`.
  - **`goals`:** each goal's name, "{progress} of {target}", a bar, and its chip. Empty: "Add a goal" → `/goals`.
  - **`upcoming`:** a list of date, name, and amount (income in the money-in color). Empty: "Nothing expected in the next two weeks."
  - **`spending_by_category`:**
    - total;
    - when not the first month, "vs. {previous} last month";
    - the top 6 categories as horizontal bars, plus "Other";
    - in the first month, the caption "Your first month".
    - Empty: "No spending yet this month."
  - **`needs_attention`:** linked items. Empty: "All caught up."
  - **`recent_transactions`:** date, description, and amount; "See all →" goes to `/transactions`. Empty: "Import your bank files to see transactions here" → `/import`.
- **e2e:**
  - `HOME_USER` is seeded like `PLAN_USER`, with its paycheck plan created (Savings 40000 → Ally Savings; Weekly spending 40000 with a 20000 weekly limit) and a goal "Emergency fund" (target 1000000).
  - Test `shows the owner's Home` (desktop only): `/` → the regions "Weekly spending", "Paycheck tasks", "Plan", "Goals", "Upcoming", "Spending by category", "Needs attention", and "Recent transactions" are visible in that order (compare the `aria-label` order). The text "left this week" is visible. "Emergency fund" is visible.
  - Test `is not blank for a new user` (desktop only, `NOSTART_USER`): `/` → the "Finish setting up" region is visible with the text "Choose your start date".

- [ ] **Step 1: Write the failing e2e** and the seed.

Run: `pnpm test:e2e e2e/home.spec.ts`
Expected: FAIL (placeholder page).

- [ ] **Step 2: Implement.**
- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test:e2e e2e/home.spec.ts e2e/shell.spec.ts`
Expected: PASS.

- [ ] **Step 4: Phone check:** screenshots at 390×844 of the owner's Home and a new user's Home. The number that matters is the biggest thing on screen (spec 15). Fix anything cramped.
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Home dashboard from widgets: weekly spending, paycheck tasks, plan, goals, upcoming, spending, needs attention, recent"
```

---

### Task 7: First-run setup flow

**Files:**
- Create: `src/app/(app)/setup/{page.tsx,actions.ts}`, `src/components/setup/{setup-flow.tsx,common-subscriptions.tsx}`, `e2e/setup.spec.ts`
- Modify: `e2e/global-setup.ts`, `e2e/fixtures.ts`

**Interfaces:**
- Consumes:
  - `getSetupStatus`, `skipSetupStep`, `unskipSetupStep`, `COMMON_SUBSCRIPTIONS`;
  - existing dialogs and forms: `StartDateCard`, `AccountDialog`, `ItemDialog` (income and bills), `CreatePlan`, `GoalDialog`;
  - `createRecurringRule`.
- Produces:
  - **Server Actions:**
    - `skipStepAction(key)`, `unskipStepAction(key)`;
    - `addCommonSubscriptionsAction(items: { name: string; cents: number; matchPattern: string; anchorDate: string }[])`, which creates one monthly subscription rule each, active, with the plan's default bucket.
  - **`/setup?step=…`**: the stepper ("Step {n} of 6", with the six titles as a progress row). It shows the requested step, else `nextStep`, else a "You're all set" panel linking to Home.
  - **Each step** has its content, a "Skip for now" button (skips it and moves to the next step), and "Next" once it's done.
  - **Step contents:**
    1. **Start date:** `StartDateCard`, with the hint "Use the date of your most recent paycheck."
    2. **Accounts:** the account list plus "Add account" (`AccountDialog`), with the hint "Use each balance as of your start date."
    3. **Income:** "Add income" opens `ItemDialog` with kind income. The list shows what's added, with the hint "Not sure of the amount? Leave it blank — the first deposit fills it in."
    4. **Plan:** `CreatePlan` (template choice plus editable buckets).
    5. **Bills:** a checklist of `COMMON_SUBSCRIPTIONS` with editable amounts and "Add selected" (first date = today), plus "Add another bill" (`ItemDialog`).
    6. **Goals:** "Add goal" (`GoalDialog`), with the hint "Include what you've already saved toward each."
  - **Navigation:**
    - Home's `setup` widget links into this page.
    - The sidebar and More menu gain "Setup" (`ListChecks` icon) only while setup is incomplete. The layout reads `getSetupStatus`.
- **e2e** `walks a new user through setup` (`SETUP_USER`, a brand-new owner with no start date):
  - `/setup` → Step 1 shown → set start date `2026-11-07` → Next;
  - Accounts → Add account "Checking" balance 100 → Next;
  - Income → Skip for now;
  - Plan → Skip for now;
  - Bills → check "Netflix" → Add selected;
  - Goals → Skip for now;
  - "You're all set" is visible → Home shows no "Finish setting up" region.

- [ ] **Step 1: Write the failing e2e** and the seed.

Run: `pnpm test:e2e e2e/setup.spec.ts`
Expected: FAIL (no page).

- [ ] **Step 2: Implement.**
- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test:e2e e2e/setup.spec.ts e2e/home.spec.ts`
Expected: PASS.

- [ ] **Step 4: Phone check** of `/setup` steps 1 and 5 at 390×844.
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: short, skippable first-run setup from start date to goals"
```

---

### Task 8: Ship and owner acceptance

**Files:**
- Modify: `docs/setup.md` (new section "15. Your Home"), `README.md` (status: Phase 2a complete)

- [ ] **Step 1: Write the owner's steps** in `docs/setup.md`:
1. Open **Home**. It's built from your plan: weekly spending left, the latest paycheck's moves, your plan, goals, what's coming up, where your money went this month, anything that needs a look, and recent transactions.
2. If **Finish setting up** appears, each step links to the page that does it. Every step can be skipped.
3. After each import, Home updates by itself: no typing.

✅ Home shows **Weekly spending** left this week, your paycheck's moves, your plan, and your goals, all from your imports. Phase 2a's goal is that this replaces the spreadsheet.

- [ ] **Step 2: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build`
Expected: all pass.

- [ ] **Step 3: Owner checkpoint.** Ask for the go-ahead to merge to `main` and push. This deploys, and the build runs migration `0007`.

After deploy, run: `curl -s -o /dev/null -w "%{http_code}" https://finnance-tau.vercel.app/`
Expected: `307`.

- [ ] **Step 4: Owner acceptance** (Phase 2a's "done when"):
- with the start date, plan, and goals set, and imports since that paycheck, Home shows weekly spending left, paycheck tasks, the plan, and goals with no manual entry;
- the owner starts living in Finnance.

After acceptance, delete this plan's `.superpowers/sdd/` workspace.
