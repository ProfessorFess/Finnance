# Phase 2a-1: Budget Plans (Bucket Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can build a budget from small blocks, and it runs on the money that actually arrives.
- Each income as it lands (imported, or logged by hand) is split into buckets by the plan's rules, or the month's income is pooled.
- Each bucket shows what's left against its own limit.
- Each income produces "Move $X to Y" tasks that tick off by themselves.

**Proof:** three automated fixtures pass:
- the owner's `budget.xlsx`;
- a two-income household on a monthly plan;
- a gig worker whose irregular payouts are each split.

**Architecture:**
- **Records first:**
  - an *income event* is any deposit linked to an income source (imported, synced, or logged with the new `logIncome`);
  - schedules are optional overlays that add "next expected" and the extra-paycheck rule.
- **A pure engine** (`src/server/plan/engine.ts`) knows only blocks:
  - funding rules applied to one income (or one month);
  - limits over calendar windows;
  - activity;
  - tasks;
  - incomes per month;
  - extra incomes.
- **Templates are data** (`templates.ts`): drafts the user, and later the assistant, edits. Nothing branches on a template key.
- **DB services** take `(db, userId, …)`. Each configuration change goes through one Zod-validated service, which is what the Phase 2b assistant tools will call.

**Tech Stack:** Phase 1c stack. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-finnance-design.md`. Sections:
- 1, especially the **Guiding principle**;
- 4.2;
- 6, "Income and recurring" and "Budgeting: the bucket engine";
- 7.4;
- 8.1, "How a plan runs";
- 10, "Plan";
- 11 (the assistant shapes the app);
- 13, "`budget.xlsx`";
- 16, Phase 2a.

**Where this sits in Phase 2a:**

| Part | Delivers | Depends on |
|---|---|---|
| **2a-1 (this plan)** | Log income, bucket engine, per-income and monthly plans, two templates, extra-income rule, move tasks, Plan page, three fixtures | Phase 1c |
| 2a-2 | Goals (starting amounts, contributions, bucket funding, projections, priority roll-over) | 2a-1 |
| 2a-3 | First-run setup, widget registry, default Home per template, cold-start fallbacks | 2a-1, 2a-2 |

## Global Constraints

- **Earlier phases' constraints still apply.** Everything in Phase 1a/1b/1c's Global Constraints:
  - read the bundled Next docs before writing Next code;
  - money in integer cents and calendar dates as `YYYY-MM-DD` strings, never `new Date(dateString)`;
  - `userId`-scoped services;
  - Server Actions call `requireUser()` and validate with Zod;
  - an activity-log row on every change;
  - migrations are add-only;
  - no real bank data in the repo;
  - no real API calls in tests.
- **The guiding principle (spec 1), applied:**
  - Nothing requires a schedule. A plan works from income events alone, and an income source without a schedule (irregular) is a first-class citizen.
  - Nothing outside `templates.ts` names the owner's buckets, amounts, categories, or accounts.
  - A plan has 1 or more buckets and 1 or more income sources, of any kind.
  - Every default is editable before and after creating the plan.
  - Pausing an income source stops *expectations* (next expected, extra-income counting); its deposits still count.
- **The spreadsheet's semantics** (`budget.xlsx`, read during planning):
  - bills per paycheck = monthly bills ÷ paychecks per month (2 for biweekly, **not** 26/12);
  - spending = weekly allowance × weeks per paycheck;
  - the remainder is what's left;
  - the check reads "fully allocated" or "Over budget";
  - "send the whole third paycheck to savings".
- **Incomes per month** (`incomesPerMonth`, which divides `sum_of_recurring` in per-income plans) is the sum over the plan's sources of:
  - **scheduled sources:** weekly 4, biweekly 2, semimonthly 2, monthly 1, quarterly ⅓, yearly 1⁄12 (the spreadsheet's convention: the extra paychecks are extra);
  - **irregular sources:** the number of its income events in the last 90 days ÷ the months observed. Months observed = (days from the first of those events to today + 1) ÷ 30, clamped to 1–3.
  - A total of 0 counts as 1. Monthly plans always use 1.
- **Extra income:** an income event from a *scheduled* source is extra when its position among that source's income events in its calendar month exceeds that frequency's paychecks per month. Position is ordered by `expected_date ?? date`.
- **Funding vs. limit are separate:**
  - funding is what each income (or month) sends to the bucket;
  - a limit is what can be spent or moved per window (`weekly`, `monthly`, or `per_income` = since the latest income).
  - The UI suggests funding from a limit: per-income plans use weekly × 4 ÷ incomesPerMonth and monthly ÷ incomesPerMonth (the spreadsheet budgets 4 weeks a month); monthly plans use weekly × 52/12 and monthly as is.
- **The remainder bucket is never negative** (`max(0, rest)`), and a shortfall shows in the health check: "Fully allocated", "{amount} unassigned", "Over by {amount}".
- **Typical income** (for health and the "≈/mo" figures):
  - per-income plans: the rounded mean of the plan's income events in the last 90 days, else the mean of the sources' non-null `planningAmount`s, else null;
  - monthly plans: the expected month (scheduled sources × their monthly equivalent, plus irregular sources' monthly planning amount).
- **Weeks** start on `user_settings.week_start_day` (0 = Sunday, default 1 = Monday). Months are calendar months.
- **One active plan per user** (partial unique index).
- **Out of scope:**
  - rollover (2b);
  - the irregular-income split rule (2b, as another `plan_rules.type`);
  - Monthly-categories and 50/30/20 templates (2b; data only);
  - template switching (2b);
  - goals (2a-2);
  - setup flow and Home (2a-3);
  - assistant tools (2b), though every service here is shaped to be one.
- **Carry-overs folded in** (`phase-1c-deferred-review-items`):
  - item 1: pause, keeping links;
  - item 2: average a varying paycheck, shown with ≈;
  - item 4: confirm deletes.
- **Shorthand tests:** a test shown with a `/* … */` body states its exact setup and assertion. Write it out with the existing helpers (`createTestUser`, `createAccount`, `insertTestTransaction`, `commitImport` + `fixtureBytes`, `listCategories`, `setTrackingStartDate`, `createIncomeSource`, `createRecurringRule`, `matchRecurring`).
- Pushing or merging needs the owner's go-ahead at execution time.

## Review Focus

1. **Households unlike the owner's.**
   - A two-income family budgeting monthly, and a gig worker whose irregular payouts are each split.
   - Both get correct numbers and never hit a message that assumes a biweekly paycheck.
   → Task 5 `a two-income household on a monthly plan`, `a gig worker splits each payout`; Task 6 e2e `starts from scratch with a monthly plan`.
2. **Income logged by hand, then imported.** If someone logs "$1,200 paycheck" and later imports the bank file with that deposit, it counts once. → Task 1 `an imported deposit replaces the matching logged income`.
3. **A small or varying income.** It shows "Over by $X", with the remainder at $0, never negative. → Task 3 `shows a shortfall as Over by, never a negative remainder`.
4. **The extra paycheck.** It goes where the rule says, and the weekly allowance keeps its limit. → Task 5 `budget.xlsx: the third paycheck goes to savings and the allowance continues`.
5. **No dead ends.**
   - Before any income arrives, or with income paused, made irregular, or deleted, the Plan page still works or says exactly what to do.
   → Task 5 `works with whatever income exists`.

---

## File Structure

```
src/lib/dates.ts (+test)                       (modify) dayOfWeek, weekWindow, monthWindow
src/server/db/finance-schema.ts                (modify) budget_plans, plan_income_sources, buckets, plan_rules; recurring_rules.bucket_id
src/server/recurring/log-income.ts (+test)     logIncome, supersedeLoggedIncome
src/server/recurring/{status,matching-service,items-service}.ts   (modify) carry-overs; bills get a bucket
src/server/import/service.ts                   (modify) supersede logged income before matching
src/server/plan/
  engine.ts (+test)                            pure blocks
  templates.ts (+test)                         PLAN_TEMPLATES (data), templateDrafts
  plans-service.ts (+test)                     createPlan, getActivePlan, setPlanIncomes, bucket CRUD, setExtraIncomeRule, deletePlan, billBucketOptions, defaultBillBucketId
  status-service.ts (+test)                    getPlanStatus
  budget-xlsx.test.ts, other-households.test.ts
src/app/(app)/plan/{page.tsx,actions.ts}       + src/components/plan/*
src/app/(app)/recurring/{actions.ts,page.tsx}, src/components/recurring/{item-dialog,log-income-dialog,item-card}.tsx   (modify/create)
e2e/plan.spec.ts; e2e/recurring.spec.ts, e2e/shell.spec.ts, e2e/global-setup.ts, e2e/fixtures.ts (modify)
docs/setup.md, README.md (modify)
```

---

### Task 1: Log income, and the recurring carry-overs

**Files:**
- Create: `src/server/recurring/log-income.ts`, `log-income.test.ts`, `src/components/recurring/log-income-dialog.tsx`
- Modify:
  - `src/server/recurring/status.ts`, `matching-service.ts`;
  - `src/server/import/service.ts`;
  - `src/app/(app)/recurring/actions.ts`, `page.tsx`;
  - `src/components/recurring/item-dialog.tsx`, `item-card.tsx`.
- Test: `src/server/recurring/status.test.ts`, `matching-service.test.ts`, `log-income.test.ts`, `e2e/recurring.spec.ts`

**Interfaces:**
- Produces:
  - **`logIncome(db: Database, userId: string, input: { incomeSourceId: string; accountId: string; date: string; amountCents: number; note?: string }): Promise<{ transactionId: string }>`**
    - creates a manual transaction: description = the source's name, amount = +`amountCents`, category = the source's category, notes = the note;
    - then `linkTransaction(…, { kind: "income", id })`;
    - activity `income.log`.
    - Errors: `ValidationError("Enter an amount above $0")`; the start-date rule is inherited from `createManualTransaction`; `NotFoundError` for another user's source or account.
  - **`supersedeLoggedIncome(db: Database, userId: string, insertedIds: string[]): Promise<number>`**
    - For each newly imported deposit (amount > 0), find a hand-logged row (`source = 'manual'`, linked to an income source, not hidden) that:
      - belongs to the same source, whose match text fits the deposit;
      - is in the same account, or has no account;
      - is within ±3 days;
      - is within `defaultToleranceCents(logged amount)`.
    - The deposit takes over the logged row's link (`income_source_id`, `expected_date`, `match_source`), and the logged row is hidden (`status = 'excluded'`) and unlinked.
    - Activity `transaction.superseded` on both rows. Nearest date first, one-to-one. Returns the count.
  - **`commitImport`** calls `supersedeLoggedIncome(insertedIds)` before `matchRecurring`. `ImportResult` gains `replacedLogged: number`, and the import summary adds "{n} logged income replaced by the bank's record".
  - **"Log income"** button on each Recurring income card (and Task 6 reuses the dialog). `LogIncomeDialog` fields: "Amount", "Date" (defaults to today in the user's timezone), "Account", and "Note". Server Action `logIncomeAction(formData)`.
  - **Carry-overs:**
    - **`planningAmount`, mode `varies`, scheduled income:** 2 or more matches in 90 days → rounded mean (`"history"`); else expected (`"estimate"`, shown with ≈); else the latest match; else unknown. Irregular income and `varies_rule` are unchanged.
    - **`rematchItem` on an inactive item** returns 0 and changes nothing.
    - **`saveItem`** reads a `paused` checkbox (`active: !paused`). When editing, the dialog shows "Paused", with the hint "Stop expecting it. Past matches stay."
    - **Delete** in `ItemDialog` opens an AlertDialog:
      - title "Delete {name}?";
      - body "Its transactions stay, but they won't be linked to anything.";
      - buttons "Cancel" and "Delete".

- [ ] **Step 1: Write the failing tests**

```ts
// log-income.test.ts — start 2026-11-07; checking account; paycheck biweekly anchor 2026-11-14 fixed 120000 pattern "Payroll Acme Corp".
it("logs income by hand and links it to its source", async () => {
  /* logIncome({ incomeSourceId: pay.id, accountId: checking.id, date: "2026-11-14", amountCents: 120000 }) → the transaction has
     amountCents 120000, source "manual", incomeSourceId pay.id, matchSource "user", expectedDate "2026-11-14";
     an irregular source → expectedDate null; amount 0 → "Enter an amount above $0"; B's source → NotFoundError. */
});
it("an imported deposit replaces the matching logged income", async () => {
  /* logIncome(pay, 2026-11-13, 118000), then commitImport(ufcu-checking) → result.replacedLogged 1;
     the Payroll Acme Corp row: incomeSourceId pay.id, expectedDate "2026-11-14"; the logged row: status "excluded", incomeSourceId null;
     getRecurringOverview lists one match for the paycheck. A logged row 10 days away, or for 50000, is left alone. */
});
// status.test.ts — replace the "varies with expected → set" expectations:
it("plans a varying paycheck with its recent average, shown as approximate", () => {
  expect(planningAmount({ mode: "varies", expectedCents: 120_000, irregular: false, matches: [], today: "2026-11-14" })).toEqual({ cents: 120_000, basis: "estimate" });
  expect(planningAmount({ mode: "varies", expectedCents: 120_000, irregular: false, matches: [m("2026-10-02", 98_000), m("2026-10-16", 120_000), m("2026-10-30", 60_000)], today: "2026-11-14" })).toEqual({ cents: 92_667, basis: "history" });
  expect(planningAmount({ mode: "varies", expectedCents: 60_000, irregular: true, matches: [m("2026-11-01", 45_000), m("2026-11-10", 45_000)], today: "2026-11-14" })).toEqual({ cents: 60_000, basis: "set" });
});
// matching-service.test.ts
it("pausing an item keeps its past matches", async () => { /* linked paycheck; updateIncomeSource active false → the row keeps incomeSourceId and matchSource "auto". */ });
```

```ts
// e2e/recurring.spec.ts (desktop only)
test("asks before deleting an item", async ({ page, isMobile }) => {
  /* RECURRING_USER: add subscription "Delete Me" (monthly, 2026-11-14, 5.00, match "Delete Me") → open → Delete → alertdialog
     "Delete Delete Me?" → Cancel → still editing → Delete → Delete → the card is gone. */
});
test("logs income by hand", async ({ page, isMobile }) => {
  /* RECURRING_LOG_USER (seeded with CHECKING and an irregular income "Tips", varies, pattern "Tips"): Recurring → "Log income" on Tips →
     Amount "85", Date "2026-11-12" → Save → the Tips card shows "Last Nov 12, 2026 · $85.00". */
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/recurring src/server/import && pnpm test:e2e e2e/recurring.spec.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**, then run the same commands.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: log income by hand (imports replace it); pause without losing matches; confirm deletes"
```

---

### Task 2: Schema, migration, and week/month math

**Files:**
- Modify: `src/server/db/finance-schema.ts`, `src/lib/dates.ts`, `src/lib/dates.test.ts`
- Create: migration `drizzle/0005_*.sql` (generated)

**Interfaces:**
- Produces:
  - **Types:**
    - `BucketRole = "spending" | "bills" | "savings" | "goal" | "buffer"`;
    - `FundingType = "fixed" | "percent" | "sum_of_recurring" | "remainder"`;
    - `LimitPeriod = "weekly" | "monthly" | "per_income"`;
    - `PlanTemplate = "paycheck_plan" | "monthly_categories" | "fifty_thirty_twenty" | "custom"`;
    - `PlanCadence = "per_income" | "monthly"`;
    - `PlanRuleType = "extra_income"`.
  - **`budget_plans`:**
    - `id, user_id, name`;
    - `template text not null`, `cadence text not null`;
    - `active boolean not null default true`;
    - timestamps;
    - partial unique index `budget_plans_one_active_idx` on `(user_id) where active`.
  - **`plan_income_sources`:** `(plan_id → budget_plans cascade, income_source_id → income_sources cascade, user_id, created_at)`, primary key `(plan_id, income_source_id)`.
  - **`buckets`:**
    - `id, user_id`, `plan_id → budget_plans cascade`;
    - `name`, `icon text not null`, `color text null`, `sort_order int not null default 0`;
    - `role`;
    - `funding_type`, `funding_cents bigint(number) null` (per income, or per month in monthly plans), `funding_bps int null`;
    - `limit_cents bigint(number) null`, `limit_period text null`;
    - `track_category_ids text[] not null default '{}'`;
    - `destination_account_id → accounts set null`;
    - timestamps;
    - index `(plan_id)`.
  - **`plan_rules`:**
    - `id, user_id`, `plan_id → budget_plans cascade`;
    - `type text not null`;
    - `bucket_id → buckets cascade`;
    - `income_source_id → income_sources cascade` (nullable);
    - `percent_bps int not null default 10000`;
    - timestamps;
    - unique `(plan_id, type)`.
  - **`recurring_rules.bucket_id`** → `buckets` set null (add column).
  - **`dates.ts`:**
    - `dayOfWeek(iso): number` (0 = Sunday);
    - `weekWindow(today, weekStartDay): { start; end }`;
    - `monthWindow(today): { start; end }`.

- [ ] **Step 1: Write the failing test** (`dates.test.ts`)

```ts
it("finds the day of the week, the week, and the month around a date", () => {
  expect(dayOfWeek("2026-01-01")).toBe(4);
  expect(dayOfWeek("2026-11-18")).toBe(3);
  expect(weekWindow("2026-11-18", 1)).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  expect(weekWindow("2026-11-16", 1)).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  expect(weekWindow("2026-11-18", 0)).toEqual({ start: "2026-11-15", end: "2026-11-21" });
  expect(monthWindow("2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/dates.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the helpers and schema; generate and apply the migration**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: `drizzle/0005_*.sql` contains only `CREATE TABLE`, `ALTER TABLE … ADD COLUMN`, `CREATE [UNIQUE] INDEX` (the active-plan index has `WHERE "active"`), and FK constraints.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run && pnpm typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: budget plan, plan income, bucket, and plan rule tables; week and month math"
```

---

### Task 3: The bucket engine (pure blocks)

**Files:**
- Create: `src/server/plan/engine.ts`, `src/server/plan/engine.test.ts`

**Interfaces:**
- Consumes: `Frequency`; `addDays`, `daysBetween`, `weekWindow`, `monthWindow`.
- Produces (no DB imports, so the UI can use it too):
  - **`PAYCHECKS_PER_MONTH: Record<ScheduledFrequency, number>`** = `{ weekly: 4, biweekly: 2, semimonthly: 2, monthly: 1, quarterly: 1/3, yearly: 1/12 }`.
  - **`incomesPerMonth(sources: { frequency: Frequency; eventDates: string[] }[], today: string): number`** (see Global Constraints).
  - **`isExtraIncome(frequency: Frequency, positionInMonth: number): boolean`**: false for irregular.
  - **Buckets and funding:**
    - `type EngineBucket = { id: string; role: BucketRole; fundingType: FundingType; fundingCents: number | null; fundingBps: number | null; limitCents: number | null; limitPeriod: LimitPeriod | null; trackCategoryIds: string[]; destinationAccountId: string | null; linkedRuleIds: string[]; linkedMonthlyCents: number }`;
    - `type Health = { kind: "fully_allocated" } | { kind: "unassigned"; cents: number } | { kind: "over"; cents: number }`;
    - `fundIncome(buckets: EngineBucket[], incomeCents: number, perMonth: number, extra: { bucketId: string; bps: number } | null): { funded: Map<string, number>; health: Health }`:
      - fixed → `fundingCents`;
      - percent → `round(income × bps / 10000)`;
      - sum_of_recurring → `round(linkedMonthlyCents / perMonth)`;
      - remainder → `max(0, rest)`;
      - health: over when rest < 0; unassigned when there's no remainder and rest > 0; else fully allocated;
      - with `extra`: only that bucket gets `round(income × bps / 10000)`.
  - **Windows:** `limitWindow(period: LimitPeriod, today: string, weekStartDay: number, lastIncomeDate: string | null, fallbackStart: string): { start: string; end: string }`:
    - weekly → `weekWindow`;
    - monthly → `monthWindow`;
    - per_income → `{ start: lastIncomeDate ?? fallbackStart, end: today }`.
  - **`suggestedFunding(limitCents: number, period: LimitPeriod, perMonth: number, cadence: PlanCadence): number`**:
    - per_income plans: weekly `round(l × 4 / perMonth)`, monthly `round(l / perMonth)`, per_income `l`;
    - monthly plans: weekly `round(l × 52 / 12)`, otherwise `l`.
  - **Activity and tasks:**
    - `type ActivityRow = { date: string; amountCents: number; accountId: string; categoryId: string | null; isTransfer: boolean; recurringRuleId: string | null }`;
    - `bucketActivity(bucket, rows, window): number`:
      - spending, bills, and buffer roles: rows in tracked categories (not transfers), plus rows whose `recurringRuleId` is in `linkedRuleIds`, each counted once, as `−sum` (refunds reduce it);
      - savings and goal roles: `+sum` of transfer inflows into the destination (0 without one), plus `−sum` of linked bill rows.
    - `type AllocationTask = { bucketId: string; amountCents: number; movedCents: number; destinationAccountId: string; done: boolean }`;
    - `allocationTasks(buckets, funded, rows, window): AllocationTask[]`: one per bucket with a destination and funded > 0.

- [ ] **Step 1: Write the failing tests**

```ts
const b = (over: Partial<EngineBucket>): EngineBucket => ({ id: "x", role: "spending", fundingType: "fixed", fundingCents: null, fundingBps: null, limitCents: null, limitPeriod: null, trackCategoryIds: [], destinationAccountId: null, linkedRuleIds: [], linkedMonthlyCents: 0, ...over });
const sheet = [
  b({ id: "sav", role: "savings", fundingCents: 40_000, destinationAccountId: "ally-sav" }),
  b({ id: "bills", role: "bills", fundingType: "sum_of_recurring", linkedRuleIds: ["phone"], linkedMonthlyCents: 36_200 }),
  b({ id: "week", fundingCents: 40_000, limitCents: 20_000, limitPeriod: "weekly", trackCategoryIds: ["coffee", "bars"], destinationAccountId: "ally-spend" }),
  b({ id: "buf", role: "buffer", fundingType: "remainder" }),
];

it("counts incomes per month from schedules and from real payouts", () => {
  expect(incomesPerMonth([{ frequency: "biweekly", eventDates: [] }], "2026-11-20")).toBe(2);
  expect(incomesPerMonth([{ frequency: "semimonthly", eventDates: [] }, { frequency: "weekly", eventDates: [] }], "2026-11-20")).toBe(6);
  expect(incomesPerMonth([{ frequency: "irregular", eventDates: ["2026-11-03", "2026-11-10", "2026-11-17"] }], "2026-11-20")).toBe(3);
  expect(incomesPerMonth([{ frequency: "irregular", eventDates: [] }], "2026-11-20")).toBe(1);
  expect([isExtraIncome("biweekly", 3), isExtraIncome("biweekly", 2), isExtraIncome("weekly", 5), isExtraIncome("irregular", 9)]).toEqual([true, false, true, false]);
});
it("funds the spreadsheet's paycheck split", () => {
  const { funded, health } = fundIncome(sheet, 120_000, 2, null);
  expect(Object.fromEntries(funded)).toEqual({ sav: 40_000, bills: 18_100, week: 40_000, buf: 21_900 });
  expect(health).toEqual({ kind: "fully_allocated" });
});
it("splits a gig payout by percentages", () => {
  const gig = [b({ id: "tax", role: "savings", fundingType: "percent", fundingBps: 2_500 }), b({ id: "bills", fundingType: "sum_of_recurring", linkedMonthlyCents: 6_000 }), b({ id: "rest", fundingType: "remainder" })];
  expect(Object.fromEntries(fundIncome(gig, 25_000, 3, null).funded)).toEqual({ tax: 6_250, bills: 2_000, rest: 16_750 });
});
it("shows a shortfall as Over by, never a negative remainder", () => {
  const { funded, health } = fundIncome(sheet, 50_000, 2, null);
  expect(funded.get("buf")).toBe(0);
  expect(health).toEqual({ kind: "over", cents: 48_100 });
});
it("reports unassigned money when there's no remainder bucket, and routes an extra income", () => {
  expect(fundIncome([b({ id: "p", fundingType: "percent", fundingBps: 1_000 }), b({ id: "f", fundingCents: 50_000 })], 120_000, 2, null).health).toEqual({ kind: "unassigned", cents: 58_000 });
  expect(Object.fromEntries(fundIncome(sheet, 120_000, 2, { bucketId: "sav", bps: 10_000 }).funded)).toEqual({ sav: 120_000, bills: 0, week: 0, buf: 0 });
});
it("picks each limit's window", () => {
  expect(limitWindow("weekly", "2026-11-18", 1, "2026-11-14", "2026-11-07")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  expect(limitWindow("monthly", "2026-11-18", 1, null, "2026-11-07")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
  expect(limitWindow("per_income", "2026-11-18", 1, "2026-11-14", "2026-11-07")).toEqual({ start: "2026-11-14", end: "2026-11-18" });
  expect(limitWindow("per_income", "2026-11-18", 1, null, "2026-11-07")).toEqual({ start: "2026-11-07", end: "2026-11-18" });
});
it("suggests funding from a limit", () => {
  expect(suggestedFunding(20_000, "weekly", 2, "per_income")).toBe(40_000);
  expect(suggestedFunding(50_000, "monthly", 2, "per_income")).toBe(25_000);
  expect(suggestedFunding(20_000, "weekly", 1, "monthly")).toBe(86_667);
});
it("counts tracked spending in the week, net of refunds, skipping transfers", () => {
  const row = (date: string, amountCents: number, categoryId: string | null, over: Partial<ActivityRow> = {}): ActivityRow => ({ date, amountCents, accountId: "chk", categoryId, isTransfer: false, recurringRuleId: null, ...over });
  const rows = [row("2026-11-16", -625, "coffee"), row("2026-11-18", -900, "bars"), row("2026-11-19", 300, "coffee"), row("2026-11-17", -5_000, "groceries"), row("2026-11-17", -1_000, "coffee", { isTransfer: true }), row("2026-11-15", -700, "coffee")];
  expect(bucketActivity(sheet[2]!, rows, { start: "2026-11-16", end: "2026-11-22" })).toBe(1_225);
});
it("counts moves into savings, and bills paid from whichever bucket they belong to", () => {
  const rows: ActivityRow[] = [
    { date: "2026-11-13", amountCents: 40_000, accountId: "ally-sav", categoryId: null, isTransfer: true, recurringRuleId: null },
    { date: "2026-11-13", amountCents: 10, accountId: "ally-sav", categoryId: null, isTransfer: false, recurringRuleId: null },
    { date: "2026-11-15", amountCents: -10_000, accountId: "chk", categoryId: "phone-cat", isTransfer: false, recurringRuleId: "phone" },
    { date: "2026-11-16", amountCents: -1_549, accountId: "chk", categoryId: "subs", isTransfer: false, recurringRuleId: "netflix" },
  ];
  const w = { start: "2026-11-13", end: "2026-11-26" };
  expect(bucketActivity(sheet[0]!, rows, w)).toBe(40_000);
  expect(bucketActivity(sheet[1]!, rows, w)).toBe(10_000);
  expect(bucketActivity(b({ trackCategoryIds: ["subs"], linkedRuleIds: ["netflix"] }), rows, w)).toBe(1_549);
});
it("makes a move task per destination and ticks it off when the transfer lands", () => {
  const { funded } = fundIncome(sheet, 120_000, 2, null);
  const rows: ActivityRow[] = [
    { date: "2026-11-13", amountCents: 40_000, accountId: "ally-sav", categoryId: null, isTransfer: true, recurringRuleId: null },
    { date: "2026-11-14", amountCents: 15_000, accountId: "ally-spend", categoryId: null, isTransfer: true, recurringRuleId: null },
  ];
  expect(allocationTasks(sheet, funded, rows, { start: "2026-11-13", end: "2026-11-26" })).toEqual([
    { bucketId: "sav", amountCents: 40_000, movedCents: 40_000, destinationAccountId: "ally-sav", done: true },
    { bucketId: "week", amountCents: 40_000, movedCents: 15_000, destinationAccountId: "ally-spend", done: false },
  ]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/plan/engine.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `engine.ts`**, then run the same command.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: bucket engine blocks (income funding, incomes per month, extra incomes, limits, activity, tasks)"
```

---

### Task 4: Templates as data, and the plans service

**Files:**
- Create: `src/server/plan/templates.ts`, `templates.test.ts`, `plans-service.ts`, `plans-service.test.ts`
- Modify: `src/server/recurring/items-service.ts` (bills get a bucket)

**Interfaces:**
- Produces (`templates.ts`, client-safe):
  - **`type BucketDraft = { name: string; role: BucketRole; icon: string; fundingType: FundingType; fundingCents: number | null; fundingBps: number | null; limitCents: number | null; limitPeriod: LimitPeriod | null; trackCategoryIds: string[]; destinationAccountId: string | null }`**
  - **`type PlanTemplateDef = { key: PlanTemplate; name: string; description: string; cadence: PlanCadence | null; buckets: (Omit<BucketDraft, "trackCategoryIds" | "destinationAccountId"> & { trackCategoryNames: string[] })[]; extraIncomeBucket: number | null }`**
  - **`PLAN_TEMPLATES`** has two entries:
    - **`paycheck_plan`:** "Paycheck plan", "Split each paycheck into savings, bills, weekly spending, and a buffer.", cadence `per_income`. Its buckets:

      | Name | Role | Icon | Funding | Limit | Tracks |
      |---|---|---|---|---|---|
      | "Savings & investing" | savings | `piggy-bank` | fixed, null | — | — |
      | "Bills" | bills | `receipt` | sum_of_recurring | — | — |
      | "Weekly spending" | spending | `coffee` | fixed, null | null, weekly | Coffee, Restaurants, Bars, Shopping |
      | "Goal fund / buffer" | buffer | `shield` | remainder | — | — |

      `extraIncomeBucket: 0`.
    - **`custom`:** "Start from scratch", "Your own buckets, split from each income or budgeted each month.", cadence null. One bucket: "Whatever's left", buffer, `wallet`, remainder. `extraIncomeBucket: null`.
  - **`templateDrafts(key, categories: { id; name }[]): { cadence: PlanCadence | null; buckets: BucketDraft[]; extraIncomeBucket: number | null }`**
- Produces (`plans-service.ts`; every function takes `(db, userId, …)`, validates with the exported Zod schemas `planInputSchema` / `bucketDraftSchema`, and logs activity):
  - **`createPlan(input: { template: PlanTemplate; cadence: PlanCadence; name: string; incomeSourceIds: string[]; buckets: BucketDraft[]; extraIncome: { bucketIndex: number; incomeSourceId: string } | null }): Promise<Plan>`**, in one transaction:
    - plan, income links, and buckets in order;
    - the extra-income rule;
    - links active bill and subscription rules without a bucket to `defaultBillBucketId`.
  - **`getActivePlan(): Promise<{ plan; buckets; rules; incomeSourceIds } | null>`**
  - **`setPlanIncomes(planId, ids)`**, `renamePlan(planId, name)`
  - **Bucket CRUD:**
    - `createBucket(planId, draft)`;
    - `updateBucket(bucketId, draft)`;
    - `deleteBucket(bucketId)`;
    - `bucketDraftOf(bucket): BucketDraft`.
  - **`setExtraIncomeRule(planId, input: { bucketId; incomeSourceId; percentBps } | null)`**, `deletePlan(planId)`
  - **`billBucketOptions(db: Executor, userId): Promise<{ id; name }[]>`**
  - **`defaultBillBucketId(db: Executor, userId): Promise<string | null>`**: the first `sum_of_recurring` bucket, else the first `bills`-role bucket, else null.
- **Validation** (`ValidationError`, with exactly these messages):
  - `"You already have a plan"`;
  - `"Choose at least one income"`;
  - `"A plan needs at least one bucket"`;
  - `"Give it a name"`;
  - `"Enter an amount above $0"` (fixed);
  - `"Enter a percent between 1 and 100"`;
  - `"Enter a limit above $0"` (a limit period without a positive limit);
  - `"Only one bucket can take what's left"`;
  - `"Extra-income rules apply to plans that split each income"` (monthly cadence);
  - `"Choose an income with a schedule for this rule"` (irregular source);
  - `NotFoundError` for another user's income, account, category, plan, or bucket.
- **`items-service`:** `RecurringRuleInput.bucketId?: string | null`.
  - On create, `undefined` means `defaultBillBucketId` for bills and subscriptions, and null for transfers.
  - On update, `undefined` keeps the current value.
  - Another user's bucket throws `NotFoundError`.

- [ ] **Step 1: Write the failing tests**

```ts
// templates.test.ts
it("ships the paycheck plan and start-from-scratch as data", () => {
  expect(PLAN_TEMPLATES.map((t) => t.key)).toEqual(["paycheck_plan", "custom"]);
  const d = templateDrafts("paycheck_plan", [{ id: "c1", name: "Coffee" }, { id: "c2", name: "Bars" }]);
  expect(d.cadence).toBe("per_income");
  expect(d.buckets.map((x) => x.name)).toEqual(["Savings & investing", "Bills", "Weekly spending", "Goal fund / buffer"]);
  expect(d.buckets[2]).toMatchObject({ limitPeriod: "weekly", trackCategoryIds: ["c1", "c2"] });
  expect(templateDrafts("custom", []).buckets).toEqual([expect.objectContaining({ name: "Whatever's left", fundingType: "remainder" })]);
});
```

```ts
// plans-service.test.ts
it("creates a plan from the paycheck template with the user's edits", async () => {
  /* Accounts checking, Ally Savings, Ally Spending; income "Paycheck" biweekly anchor 2026-11-14 fixed 120000; bill "Phone" 10000 monthly.
     drafts: Savings fundingCents 40000 → Ally Savings; Weekly spending fundingCents 40000, limitCents 20000 weekly → Ally Spending.
     createPlan({ template: "paycheck_plan", cadence: "per_income", name: "Paycheck plan", incomeSourceIds: [pay.id], buckets: drafts,
     extraIncome: { bucketIndex: 0, incomeSourceId: pay.id } }) → getActivePlan: 4 buckets in order; rules [{ type: "extra_income",
     bucketId: savings.id, incomeSourceId: pay.id, percentBps: 10000 }]; Phone.bucketId = Bills.id. */
});
it("creates plans for incomes of any kind", async () => {
  /* monthly plan from scratch with "Day job" (semimonthly) and "Freelance" (irregular) → incomeSourceIds has both;
     per-income plan with only an irregular "Driver payouts" source → created, no rules. */
});
it("validates plans and buckets", async () => {
  /* [] incomes → "Choose at least one income"; fixed 0 → "Enter an amount above $0"; percent 0 → "Enter a percent between 1 and 100";
     limitPeriod "weekly" with limitCents null → "Enter a limit above $0"; two remainders → "Only one bucket can take what's left";
     extraIncome on a monthly plan → "Extra-income rules apply to plans that split each income"; extraIncome with an irregular source →
     "Choose an income with a schedule for this rule"; deleting the only bucket → "A plan needs at least one bucket";
     a second active plan → "You already have a plan". */
});
it("new bills join the plan's bills bucket unless told otherwise", async () => {
  /* createRecurringRule("Netflix", subscription) → Bills.id; ("Spotify", bucketId Weekly spending.id) → that bucket; a transfer rule → null. */
});
it("isolates users", async () => { /* B can't touch A's plan, buckets, or rule; A can't link B's income, account, or bucket. */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/plan`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**, then run `pnpm vitest run && pnpm typecheck`.
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: plan templates as data; plans built from any incomes; bills choose their bucket"
```

---

### Task 5: Plan status, and three fixtures

**Files:**
- Create: `src/server/plan/status-service.ts`, `status-service.test.ts`, `budget-xlsx.test.ts`, `other-households.test.ts`

**Interfaces:**
- Consumes: Tasks 3–4; `getSettings`, `todayInTimeZone`, `planningAmount`, `monthlyEquivalentCents`, `nextOccurrence`.
- Produces:
  - **`type BucketView`**:
    - identity: `id, name, icon, role, fundingType`;
    - funding: `fundedCents` (from the latest income, or this month), `typicalFundedCents`, `monthlyCents`;
    - limit: `limitCents: number | null`, `limitPeriod: LimitPeriod | null`;
    - activity: `window: { start; end }`, `resetsOn: string | null`, `activityCents`, `remainingCents: number | null`;
    - `destinationAccountName: string | null`, `draft: BucketDraft`.
  - **`type TaskView = AllocationTask & { bucketName: string; destinationAccountName: string }`**
  - **`type PlanStatus`:**
    - `plan: { id; name; cadence; template }`, `incomes: { id; name; scheduled: boolean }[]`, `today: string`;
    - `problem: null | "no_income"`;
    - `latestIncome: { transactionId: string; sourceName: string; date: string; amountCents: number; isExtra: boolean } | null` (per-income plans);
    - `month: { month: string; expectedCents: number; receivedCents: number } | null` (monthly plans);
    - `nextExpected: { sourceName: string; date: string; amountCents: number | null } | null`;
    - `typicalIncomeCents: number | null`, `incomesPerMonth: number`, `health: Health | null`;
    - `buckets: BucketView[]`, `tasks: TaskView[]`.
  - **`getPlanStatus(db, userId, now?: Date): Promise<PlanStatus | null>`**: null without an active plan.
- **Rules:**
  - **Income events:** non-excluded rows with amount > 0, linked to the plan's sources, dated from the start date through today.
  - **Per-income plans:**
    - `latestIncome` = the latest event (date, then id);
    - `isExtra` = the plan has an `extra_income` rule for that source, the source is scheduled and active, and `isExtraIncome(frequency, position)`;
    - `fundedCents` = `fundIncome(latest amount, incomesPerMonth, rule if isExtra)`, or 0 per bucket with no event yet.
  - **Monthly plans:**
    - `month.expectedCents` = typical (see Global Constraints);
    - `month.receivedCents` = events in the month;
    - `fundedCents` = `fundIncome(expected, 1, null)`.
  - **Typical funding and health:**
    - `typicalFundedCents` and `health` = `fundIncome(typical, perMonth, null)`, or null when typical is null;
    - `monthlyCents` = `typicalFundedCents × perMonth`.
  - **Windows and limits:**
    - `window`: the bucket's limit window, or when it has no limit, `per_income` (since the latest income) for per-income plans and the month for monthly plans;
    - `resetsOn` = `window.end + 1` for weekly and monthly limits, else null.
    - `limitCents`: the bucket's limit, or, for savings, goal, and bills roles without one, `fundedCents` (the target this income or month).
    - `remainingCents` = limit − activity, or null without a limit.
  - **Tasks:** from the latest income, with its window from the event date to today (per-income plans), or for the month (monthly plans).
  - **`nextExpected`:** the earliest `nextOccurrence ≥ today` among active scheduled sources, with its planning amount.
  - **`problem`:** `"no_income"` only when the plan has no income sources. Paused, irregular, or not-yet-arrived income is never a problem.

- [ ] **Step 1: Write the failing tests**

```ts
// status-service.test.ts — start 2026-11-07; checking holds ufcu-checking; Ally Savings, Ally Spending; paycheck biweekly anchor 2026-11-14
// fixed 120000 pattern "Payroll Acme Corp"; Prime Video subscription 2164 monthly anchor 2026-11-14 pattern "Prime Video";
// paycheck plan: Savings 40000 → Ally Savings; Weekly spending 40000 with limit 20000 weekly → Ally Spending; extra rule → Savings.
const now = new Date("2026-11-18T18:00:00Z");
it("shows the latest income, its tasks, and each bucket", async () => {
  /* latestIncome ⊇ { sourceName: "Paycheck", date: "2026-11-14", amountCents: 120000, isExtra: false }; incomesPerMonth 2;
     fundedCents Savings 40000, Bills 1082, Weekly spending 40000, Goal fund / buffer 38918; health fully_allocated;
     Weekly spending: limitCents 20000, window 2026-11-16..2026-11-22, resetsOn "2026-11-23", activityCents 0, remainingCents 20000;
     Bills: window 2026-11-14..2026-11-18, activityCents 2164, limitCents 1082, remainingCents -1082;
     tasks = [Savings & investing → Ally Savings 40000 moved 0, Weekly spending → Ally Spending 40000 moved 0];
     nextExpected = { sourceName: "Paycheck", date: "2026-11-28", amountCents: 120000 }. */
});
it("works with whatever income exists", async () => {
  /* now 2026-11-10 (nothing has arrived) → problem null, latestIncome null, tasks [], buckets show typicalFundedCents 40000/1082/40000/38918;
     paused paycheck → problem null, nextExpected null, latestIncome still 2026-11-14; income made irregular → problem null, nextExpected null;
     deleteIncomeSource → problem "no_income". Never throws. */
});
it("returns null without a plan, and isolates users", async () => { /* B → null; A's activity never includes B's rows. */ });
```

```ts
// budget-xlsx.test.ts — the owner's spreadsheet through the services (spec 13). Accounts UFCU Checking, Ally Savings, Ally Spending.
// Income biweekly fixed 120000 pattern "Payroll Acme". Bills (monthly): Phone 10000, Subscriptions 14200, Haircuts 3000, Gas 9000.
// Paycheck plan: Savings 40000 → Ally Savings; Weekly spending 40000 with limit 20000 weekly → Ally Spending; extra rule → Savings.
it("budget.xlsx: the per-paycheck split matches the spreadsheet", async () => {
  /* start 2026-11-07, anchor 2026-11-13, now 2026-11-16T18:00Z (no deposit yet) → typicalIncomeCents 120000;
     typicalFundedCents 40000 / 18100 / 40000 / 21900 (sum 120000); monthlyCents 80000 / 36200 / 80000 / 43800;
     Weekly spending limitCents 20000; health fully_allocated. */
});
it("budget.xlsx: a bigger allowance reads Over budget", async () => {
  /* updateBucket Weekly spending fundingCents 70000 → health { kind: "over", cents: 8100 }; buffer typicalFundedCents 0. */
});
it("budget.xlsx: the third paycheck goes to savings and the allowance continues", async () => {
  /* start 2027-01-01, anchor 2027-01-01; deposits "Payroll Acme" +120000 on 2027-01-01, 2027-01-15, 2027-01-29 (insert, then matchRecurring);
     now 2027-01-30T18:00Z → latestIncome.isExtra true; fundedCents Savings 120000, others 0;
     tasks = [{ bucketName: "Savings & investing", amountCents: 120000, destinationAccountName: "Ally Savings" }];
     Weekly spending limitCents 20000; health fully_allocated. */
});
```

```ts
// other-households.test.ts — spec 1: "two jobs, a freelancer, or someone who prefers a monthly category budget".
it("a two-income household on a monthly plan", async () => {
  /* start 2026-11-01; checking. Incomes: "Day job" semimonthly anchor 2026-11-15 secondDay 31 fixed 150000 pattern "Acme Payroll";
     "Freelance" irregular varies expected 60000 pattern "Upwork". Bills: Internet 6000 monthly; Car insurance 60000 quarterly anchor 2026-11-05.
     createPlan custom, monthly, both incomes, buckets: Rent fixed 120000 tracks "Rent & housing"; Bills sum_of_recurring;
     Groceries fixed 50000 with limit 50000 monthly tracks Groceries; Fun 10% tracks Restaurants + Entertainment; Savings remainder (role savings).
     Rows: "Acme Payroll" +150000 on 2026-11-14, "Upwork" +45000 on 2026-11-10 (then matchRecurring); groceries -8000 on 2026-11-03 and -4500 on 2026-11-20.
     now 2026-11-21T18:00Z → month = { month: "2026-11", expectedCents: 360000, receivedCents: 195000 };
     fundedCents Rent 120000, Bills 26000, Groceries 50000, Fun 36000, Savings 128000; health fully_allocated;
     Groceries: window 2026-11-01..2026-11-30, activityCents 12500, remainingCents 37500; nextExpected.date "2026-11-30"; problem null. */
});
it("a gig worker splits each payout", async () => {
  /* start 2026-11-01; checking and "Tax savings" accounts. Income "Driver payouts" irregular varies (no amount) pattern "Payout".
     Bill Phone 6000 monthly anchor 2026-11-05. createPlan custom, per_income, [payouts], buckets: Taxes 25% role savings → Tax savings;
     Bills sum_of_recurring; Savings 10% role savings; Spending remainder. Payouts +30000 on 11-03, +45000 on 11-10, +25000 on 11-17 (then matchRecurring).
     now 2026-11-20T18:00Z → incomesPerMonth 3; latestIncome ⊇ { date: "2026-11-17", amountCents: 25000, isExtra: false };
     fundedCents Taxes 6250, Bills 2000, Savings 2500, Spending 14250; typicalIncomeCents 33333;
     typicalFundedCents Taxes 8333, Bills 2000, Savings 3333, Spending 19667; health fully_allocated;
     tasks = [{ bucketName: "Taxes", amountCents: 6250, destinationAccountName: "Tax savings", movedCents: 0 }]; nextExpected null. */
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/plan`
Expected: the new files FAIL.

- [ ] **Step 3: Implement `status-service.ts`**, then run `pnpm vitest run && pnpm typecheck`.
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: plan status from real income; budget.xlsx plus two other households as fixtures"
```

---

### Task 6: Plan page — choose a starting point, shape it, watch it run

**Files:**
- Modify: `src/app/(app)/plan/page.tsx` (replace the placeholder), `e2e/shell.spec.ts` (drop the `/plan` placeholder row), `e2e/global-setup.ts`, `e2e/fixtures.ts`
- Create:
  - `src/app/(app)/plan/actions.ts`;
  - `src/components/plan/{create-plan.tsx,bucket-draft-row.tsx,income-card.tsx,bucket-card.tsx,health-chip.tsx,plan-board.tsx}`;
  - `e2e/plan.spec.ts`.

**Interfaces:**
- Consumes: `getPlanStatus`, `createPlan`, `PLAN_TEMPLATES`, `templateDrafts`, the engine (client-side for the live health line), `LogIncomeDialog`, `listIncomeSources`, `listAccounts`, `listCategories`.
- Produces:
  - Server Action `createPlanAction(input)`, validated with `planInputSchema`; it revalidates `/plan`.
- **The create flow** (needs a start date and at least one income source, else an empty state linking to Accounts or Recurring):
  1. **"Choose a starting point":** one card per template.
  2. **"How should money be split?":** "Split each income as it arrives" or "Budget each month". This is preset by the Paycheck plan template and editable for Start from scratch.
  3. **"Funded by":** income checkboxes, any kind (scheduled or irregular), at least one.
  4. **"Your buckets":** one row per draft, with:
     - "Name";
     - "Gets" (Fixed amount / Percent / Its bills / What's left);
     - the amount labeled "from each income" or "each month";
     - "Limit" (optional amount + "per week / per month / since last income");
     - "Move to" (account, "None");
     - remove.

     Typing a limit fills an empty fixed "Gets" with `suggestedFunding`. "Add bucket" adds a row.
  5. **The extra-income rule** (per-income plans with a scheduled income): "Extra paychecks from {income} go to {bucket select | nowhere special}", pre-set from the template.
  6. **A live health line** for a typical income, computed client-side.
  7. **"Create plan".**
- **The plan view:**
  - **`IncomeCard`:**
    - per-income plans:
      - an event: "{source} · {date}" with the amount large, plus "Extra paycheck · it all goes to {bucket}" when extra, and the tasks below;
      - no event yet: "Waiting for your first income".
    - monthly plans: "{Month}" with "{received} of ≈ {expected} received".
    - Also: "Next: {source} {date}, ≈ {amount}" when known, and a **"Log income"** button.
    - Tasks: "Move {amount} to {account}" with a check when done, else "{moved} of {amount} moved".
    - Problem `no_income`: "This plan has no income. Choose one in Edit plan."
  - **`HealthChip`:** "Fully allocated", "{amount} unassigned", "Over by {amount}" (destructive), with the subtitle "for a typical ≈ {typical} income".
  - **`BucketCard`s:**
    - **With a limit:** big "{remaining} left this week / this month / since your last income", a bar, and "{limit} per week · resets {weekday}".
    - **Savings and goal:** "{activity} of {funded} moved".
    - **Without a limit:** "{activity} spent" plus "gets {fundedCents} from each income" or "each month".
    - A negative remaining reads "{amount} over" in red.
- **e2e** (desktop only; no date assertions):
  - **`PLAN_USER`:** seeded with CHECKING, plus "Ally Savings" (savings) and "Ally Spending" accounts, a paycheck (biweekly, anchor 2026-11-14, fixed 120000, "Payroll Acme Corp"), and Prime Video (2164 monthly, anchor 2026-11-14).
    Test `creates the paycheck plan and shows the buckets`: Paycheck plan → Savings "Gets" 400, Move to Ally Savings → Weekly spending Limit 200 per week (Gets fills 400), Move to Ally Spending → Create plan → the four bucket headings and "Fully allocated" are visible.
  - **`PLAN_SCRATCH_USER`:** seeded with CHECKING and an irregular income "Side gigs" (varies, expected 50000, pattern "Venmo").
    Test `starts from scratch with a monthly plan`: Start from scratch → Budget each month → check Side gigs → Add bucket "Groceries", Gets 300, Limit 300 per month → Create plan → "Groceries" and "Whatever's left" visible, "Fully allocated" visible, and nothing matching /paycheck/i on the income card.

- [ ] **Step 1: Read the Next docs** for forms and Server Actions (`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, `02-guides/forms.md`).
- [ ] **Step 2: Write the failing e2e** and the seeds.

Run: `pnpm test:e2e e2e/plan.spec.ts`
Expected: FAIL (placeholder page).

- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test:e2e e2e/plan.spec.ts e2e/shell.spec.ts`
Expected: PASS.

- [ ] **Step 5: Phone check:** screenshots at 390×844 of the create flow and both plan views. Fix anything cramped; the number that matters is the biggest thing on screen.
- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Plan page with starting points, editable buckets, income card, tasks, and health"
```

---

### Task 7: Plan edit mode

**Files:**
- Modify: `src/app/(app)/plan/actions.ts`, `src/components/plan/plan-board.tsx`, `e2e/plan.spec.ts`, `e2e/global-setup.ts`, `e2e/fixtures.ts`
- Create: `src/components/plan/bucket-dialog.tsx`, `src/components/plan/plan-settings.tsx`

**Interfaces:**
- Consumes: Task 4 services.
- Produces:
  - **Server Actions** (each revalidates `/plan`):
    - `saveBucketAction(planId, draft, bucketId?)`;
    - `deleteBucketAction(id)`;
    - `setPlanIncomesAction(planId, ids)`;
    - `setExtraIncomeAction(planId, input | null)`;
    - `renamePlanAction(planId, name)`;
    - `deletePlanAction(planId)`.
  - **"Edit plan"** toggles edit mode: an "Edit" button on each card, and "Add bucket".
  - **`BucketDialog`** fields:
    - Name;
    - Kind (Spending, Bills, Savings, Goal, Buffer);
    - Gets (with amount or percent);
    - Limit (amount + period, or none);
    - "Counts spending in" (category checkboxes by group);
    - Move to.
    - Buttons: Save, and Delete (AlertDialog "Delete {name}?").
  - **`PlanSettings`:**
    - name;
    - "Funded by" (income checkboxes);
    - the extra-income rule (per-income plans);
    - "Start over", which deletes the plan after the AlertDialog "Delete your plan? Your transactions and recurring items stay."
- **e2e:** `PLAN_EDIT_USER`, seeded like `PLAN_USER` with the paycheck plan created in global-setup.
  Test `edits a bucket and sees the health check change`: Edit plan → Edit "Weekly spending" → Gets "900" → Save → "Over by" is visible.

- [ ] **Step 1: Write the failing e2e** and seed.

Run: `pnpm test:e2e e2e/plan.spec.ts`
Expected: the new test FAILS.

- [ ] **Step 2: Implement**, then run `pnpm typecheck && pnpm lint && pnpm test:e2e e2e/plan.spec.ts`.
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: edit buckets, incomes, and the extra-income rule, or start the plan over"
```

---

### Task 8: "Paid from" on bills

**Files:**
- Modify: `src/components/recurring/item-dialog.tsx`, `src/app/(app)/recurring/{actions.ts,page.tsx}`, `src/components/transactions/transaction-sheet.tsx` (pass options through), `e2e/recurring.spec.ts`

**Interfaces:**
- Consumes: `billBucketOptions`, `RecurringRuleInput.bucketId`.
- Produces:
  - With a plan, `ItemDialog` shows "Paid from" for bill, subscription, and transfer kinds: the plan's buckets plus "Not in my plan". New items default to the bills bucket.
  - `saveItem` reads `bucketId` (an empty string means null).
- **e2e** `chooses which bucket pays a bill` (`PLAN_EDIT_USER`): Recurring → Add → Subscription "Spotify" (monthly, 2026-11-14, 11.99, match "Spotify"), Paid from "Weekly spending" → Save → reopen it → "Paid from" shows "Weekly spending".

- [ ] **Step 1: Write the failing e2e**

Run: `pnpm test:e2e e2e/recurring.spec.ts`
Expected: the new test FAILS.

- [ ] **Step 2: Implement**, then run `pnpm typecheck && pnpm lint && pnpm test:e2e e2e/recurring.spec.ts`.
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: choose which bucket pays each bill"
```

---

### Task 9: Ship and owner acceptance

**Files:**
- Modify: `docs/setup.md` (new section "13. Make your plan"), `README.md` (status: Phase 2a-1)

- [ ] **Step 1: Write the owner's steps** in `docs/setup.md`:
1. Make sure your paycheck is in **Recurring** (step 12). Income that isn't in a bank file can be added with **Log income**.
2. Open **Plan** and choose **Paycheck plan** (or **Start from scratch**: split each income as it arrives, or budget each month).
3. Set what each bucket gets from each paycheck, and any limits (like $200 per week). Pick where money moves to. Add, rename, or remove buckets freely; everything can change later in **Edit plan**.
4. Bills come from **Recurring**: each is paid from its **Paid from** bucket (your **Bills** bucket by default), shared across the paychecks in a month. Whatever's left goes to **Goal fund / buffer**.
5. When a paycheck arrives, **Plan** shows it with your moves ("Move $400 to Ally Savings"). Each one ticks off by itself once the transfer shows up.

✅ **Weekly spending** shows what's left this week, and the check reads **Fully allocated**.

- [ ] **Step 2: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build`
Expected: all pass, including `budget-xlsx.test.ts` and `other-households.test.ts`.

- [ ] **Step 3: Owner checkpoint.** Ask for the go-ahead to merge to `main` and push. This deploys, and the build runs migration `0005`.

After deploy, run: `curl -s -o /dev/null -w "%{http_code}" https://finnance-tau.vercel.app/plan`
Expected: `307`.

- [ ] **Step 4: Owner acceptance.** The owner creates their plan:
- the split matches what they expect;
- after the next import, the paycheck card shows the move tasks ticking off, and Weekly spending shows this week's real spending.

After acceptance, delete this plan's `.superpowers/sdd/` workspace.
