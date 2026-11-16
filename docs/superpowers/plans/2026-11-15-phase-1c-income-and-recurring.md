# Phase 1c: Income and Recurring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paychecks, bills, and subscriptions are entered once and then expected automatically. Each imported deposit or charge that fits is linked to its expected occurrence, so it counts once. The Recurring page shows what arrived, what's next, and what's late. Finnance also spots repeating charges the user hasn't added and offers to track them.

**Architecture:**
- **Pure modules** under `src/server/recurring/`, each with its own tests:
  - `schedule.ts`: when items are expected;
  - `match.ts`: which transaction fulfils which occurrence;
  - `status.ts`: late, waiting for import, or next;
  - `detect.ts`: repeating merchants not yet tracked.
- **DB-facing services** sit beside them and take `(db, userId, …)`, as in Phases 1a and 1b.
- **Two tables, one matcher.** The spec's `IncomeSource` and `RecurringRule` stay separate, because Phase 2a links plans to income sources and buckets to recurring rules. Both reduce to one `MatchItem` shape for matching.
- **Links live on `transactions`** (`income_source_id` / `recurring_rule_id` / `expected_date` / `match_source`), and expected occurrences are never stored (spec 7.4).
- **Import pipeline:** commit → transfers → categorize → **match recurring**. Matching failures never fail an import.
- **Categories through rules.** An item with a category creates a `description_contains` category rule with origin `"recurring"` (spec 7.5). Categorization keeps using the Phase 1b pipeline unchanged.

**Tech Stack:** Phase 1b stack. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-finnance-design.md`. Sections:
- 6, "Income and recurring";
- 7.1 step 5;
- 7.4;
- 7.5 (recurring items create rules; irregular-income estimate);
- 10, "Recurring";
- 13, "First-run setup" step 3 (amount taken from the first matched deposit);
- 16, the Phase 1 "done when": "the paycheck is matched to its income source".

## Global Constraints

- Everything in Phase 1a's and 1b's Global Constraints still applies:
  - read the bundled Next docs (`node_modules/next/dist/docs/`) before writing Next code;
  - money in integer cents, calendar dates as `YYYY-MM-DD` strings, never `new Date(dateString)` for a calendar date;
  - `userId`-scoped services;
  - Server Actions call `requireUser()` and validate with Zod;
  - an activity-log row on every change;
  - no real bank data in the repo;
  - migrations are add-only;
  - no real API calls in tests.
- **Matching constants**, in `src/server/recurring/schedule.ts` and nowhere else:
  - `MATCH_WINDOW_DAYS = 3`: a transaction fulfils an occurrence within ±3 days (spec 7.4);
  - `DUE_SOON_DAYS = 7`;
  - `ESTIMATE_LOOKBACK_DAYS = 90`: the "3 months" in spec 7.4/7.5;
  - `defaultToleranceCents(expected) = Math.max(200, Math.round(expected * 0.2))`. The ±20% (min $2) leaves room for a price change, which should still match and is surfaced in Phase 4.
- **The anchor date is the first occurrence.** Items repeat from `anchor_date` forward, never before it. Creating from a transaction sets the anchor to that transaction's date.
- **Amounts are stored positive.** Direction comes from the kind: income means money in; bill, subscription, and transfer mean money out.
- **"Late" needs data.** An occurrence is late only when imported data for that account covers its date plus the window. Otherwise it is "waiting for import". The owner imports monthly, so most of the month would otherwise look late.
- **The user's choice is final.**
  - Rows the user linked (`match_source = 'user'`) or dismissed (`'dismissed'`) are never re-linked or unlinked by automation.
  - Every automatic UPDATE re-checks eligibility in its WHERE clause.
- **Today** is computed in the user's timezone (`user_settings.timezone`) with `todayInTimeZone`. Every service that needs it takes `now: Date` so tests can pin it.
- **Out of scope:**
  - Home widgets (Upcoming, Income received vs. expected) and `bucketId` (Phase 2a);
  - price-change alerts (Phase 4);
  - full detection (Phase 3);
  - business-day shifting of due dates (the ±3-day window covers weekend paydays);
  - deferred Phase 1b items 1, 2, 5, 6, 8, 9.
- **Carry-overs folded in:**
  - Phase 1b deferred item 3 (eligibility guards on automatic UPDATEs);
  - Phase 1b deferred item 7 (an AI "unknown" keeps the earlier guess).
- **Shorthand tests:** a test shown with a `/* … */` or `// …` body states its exact setup and assertion in that comment. The implementer writes it out with the existing helpers (`createTestUser`, `createAccount`, `insertTestTransaction`, `commitImport` + `fixtureBytes`, `listCategories`, `setTrackingStartDate`) and asserts exactly what the comment says.
- **Fixture facts** used below (`ufcu-checking.csv`, start date 2026-11-07):
  - `Payroll Acme Corp` +$1,200.00 on 2026-11-14;
  - `Prime Video` −$21.64 on 2026-11-14;
  - two `Bennu Coffee` −$6.25 on 2026-11-13;
  - an 11-12 transfer to savings;
  - the latest row is dated 2026-11-15 and is pending, so it is skipped. Cleared data runs through 2026-11-14.
- Pushing or merging needs the owner's go-ahead at execution time.

## Review Focus

1. **Not imported yet is not late.** The owner imports once a month. A paycheck expected on Nov 27 must read "waiting for import", not "late", until data covering Nov 30 exists. → Task 5 `does not call an occurrence late when no data covers it yet`.
2. **Month-end anchors.** A bill due on the 31st must land on Feb 28 and then go back to Mar 31, never drifting to the 28th for good. → Task 2 `keeps a 31st anchor at month end without drifting`.
3. **A paycheck that varies and moves.** The owner's real biweekly deposit varies up to 6× in amount and sometimes lands a day early (Wednesday instead of Thursday). "Varies" income must match on pattern and date alone. → Task 4 `matches a varying paycheck that arrives a day early`.
4. **The user's choice is final.** "Not this one", and a manual link, must survive re-matching, editing the item, and re-import. → Task 4 `never re-links a dismissed row and keeps manual links on rematch`.
5. **Same merchant, different items.** Two Apple subscriptions ($0.99 and $9.99) must each take the charge that fits their amount. A second charge in the same window must not take an occurrence that's already fulfilled. → Task 4 `assigns same-merchant charges to the item whose amount fits`, `one transaction per occurrence, nearest first`.

---

## File Structure

```
src/lib/dates.ts (+test)                      (modify) addDays, daysBetween, lastDayOfMonth, todayInTimeZone
src/lib/recurring-labels.ts                   client-safe labels: FREQUENCY_LABELS, KIND_LABELS, INCOME_TYPE_LABELS
src/server/db/finance-schema.ts               (modify) income_sources, recurring_rules, recurring_dismissals, transaction link columns, RuleOrigin "recurring"
src/server/categorize/rules.ts                (modify) export containsWords (whole-word matcher, reused)
src/server/categorize/pipeline.ts             (modify) carry-overs: UPDATE guards, AI "unknown" keeps guess
src/server/categorize/transfers-service.ts    (modify) carry-over: re-check both rows before pairing
src/server/recurring/
  schedule.ts (+test)                         Frequency, Schedule, occurrencesBetween, nextOccurrence, monthlyEquivalentCents, constants
  items-service.ts (+test)                    income source + recurring rule CRUD, category rule on save
  match.ts (+test)                            matchesPattern, findMatches (pure)
  matching-service.ts (+test)                 matchRecurring, rematchItem, linkTransaction, listMatchOptions
  status.ts (+test)                           itemStatus, planningAmount (pure)
  overview.ts (+test)                         getRecurringOverview
  detect.ts (+test)                           detectRecurring (pure)
  suggestions-service.ts (+test)              listSuggestions, dismissSuggestion
src/server/import/service.ts                  (modify) match after categorize; ImportResult.matched
src/server/finance/transactions.ts            (modify) TransactionRow.match
src/app/(app)/recurring/{page.tsx,actions.ts} + src/components/recurring/*
src/app/(app)/transactions/{page.tsx,actions.ts}, src/components/transactions/{transaction-sheet,transaction-list}.tsx, src/components/import/file-card.tsx (modify)
e2e/recurring.spec.ts; e2e/global-setup.ts (modify)
docs/setup.md (modify)
```

---

### Task 1: Sorting carry-overs (Phase 1b deferred items 3 and 7)

**Files:**
- Modify: `src/server/categorize/pipeline.ts`, `src/server/categorize/transfers-service.ts`
- Test: `src/server/categorize/pipeline.test.ts`, `src/server/categorize/transfers-service.test.ts`

**Interfaces:**
- Produces: no new exports. Behavior changes only:
  - `categorizeTransactions` writes a decision only if the row is still eligible at write time (`categorization_source IS DISTINCT FROM 'user'` and pair id null or `"none"`). It logs activity only for rows actually updated (`.returning({ id })`).
  - An AI result with `categoryId: null` keeps the row's existing `categoryId`.
  - `detectTransfers`, inside its transaction, re-selects both rows of each pair `FOR UPDATE` with the same eligibility as its initial query (`transfer_pair_id IS NULL`, not excluded, source not `'user'`). It pairs them only if both are still eligible.

- [ ] **Step 1: Write the failing tests**

```ts
// pipeline.test.ts
it("does not overwrite a choice made while sorting was running", async () => {
  /* Fake AI that, before returning, sets row X to categoryId=gifts, source "user"
     (simulating another device). It answers X → coffee, confidence 0.9.
     After categorizeTransactions: X is still gifts / "user", and there is no
     "transaction.auto_categorize" activity row for X. */
});
it("an AI 'unknown' keeps the earlier guess", async () => {
  /* Row with categoryId=coffee and source null. Fake AI returns categoryId null,
     confidence 0.2. Afterward: categoryId is still coffee, needsReview true,
     source "ai". */
});

// transfers-service.test.ts
it("skips a pair whose side the user categorized meanwhile", async () => {
  /* Two transfer-like opposite rows. Spy on pairTransfers (vi.spyOn on the module
     export) so that, once it returns the pair, row B is updated to source "user".
     detectTransfers returns 0; neither row has a transferPairId. */
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/server/categorize`
Expected: the three new tests FAIL. The rest pass.

- [ ] **Step 3: Implement the guards** as described in Interfaces. Use `sql\`${transactions.categorizationSource} is distinct from 'user'\`` and drizzle's `.for("update")`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test src/server/categorize`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix: re-check eligibility before automatic sorting writes; keep guesses on AI unknown"
```

---

### Task 2: Calendar math and schedules

**Files:**
- Modify: `src/lib/dates.ts`, `src/lib/dates.test.ts`
- Create: `src/server/recurring/schedule.ts`, `src/server/recurring/schedule.test.ts`, `src/lib/recurring-labels.ts`

**Interfaces:**
- Produces (`src/lib/dates.ts`). All work on `YYYY-MM-DD` strings through UTC day numbers, never local time:
  - `addDays(iso: string, n: number): string`
  - `daysBetween(from: string, to: string): number` (`to − from`, may be negative)
  - `lastDayOfMonth(year: number, month: number): number` (month 1–12; reuse the existing `daysInMonth`)
  - `todayInTimeZone(timeZone: string, now?: Date): string` (via `Intl.DateTimeFormat("en-CA", { timeZone })`)
- Produces (`src/server/recurring/schedule.ts`):
  - `type Frequency = "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "yearly" | "irregular"`
  - `type ScheduledFrequency = Exclude<Frequency, "irregular">`
  - `type Schedule = { frequency: Frequency; anchorDate: string | null; secondDay: number | null }`. `secondDay` is used only by semimonthly: 1–31, where 31 means the last day of the month.
  - `occurrencesBetween(s: Schedule, from: string, to: string): string[]`: ascending and inclusive, never before `anchorDate`. Irregular returns `[]`.
  - `nextOccurrence(s: Schedule, onOrAfter: string): string | null`
  - `PERIODS_PER_YEAR: Record<ScheduledFrequency, number>`: `{ weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, quarterly: 4, yearly: 1 }`
  - `monthlyEquivalentCents(cents: number, f: ScheduledFrequency): number`: `Math.round(cents * PERIODS_PER_YEAR[f] / 12)`
  - the constants `MATCH_WINDOW_DAYS`, `DUE_SOON_DAYS`, `ESTIMATE_LOOKBACK_DAYS`, `defaultToleranceCents` (see Global Constraints)
- Produces (`src/lib/recurring-labels.ts`, client-safe, imports types only):
  - `FREQUENCY_LABELS`: weekly "Weekly", biweekly "Every 2 weeks", semimonthly "Twice a month", monthly "Monthly", quarterly "Every 3 months", yearly "Yearly", irregular "Irregular";
  - `KIND_LABELS`: income "Income", bill "Bill", subscription "Subscription", transfer "Transfer";
  - `INCOME_TYPE_LABELS`: salary "Salary", hourly "Hourly", freelance "Freelance", benefits "Benefits", side_income "Side income", other "Other".
- **Algorithm:**
  - weekly and biweekly step 7 or 14 days from the anchor;
  - monthly, quarterly, and yearly step 1, 3, or 12 months from the anchor's month, each time using `min(anchorDay, lastDayOfMonth)`. The day is clamped per month, never carried forward;
  - semimonthly yields, in each month, `anchorDay` and `secondDay`, each clamped to the month's last day, filtered to dates on or after the anchor.

- [ ] **Step 1: Write the failing tests**

```ts
// dates.test.ts
it("adds days across month, year, and leap boundaries", () => {
  expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
  expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2026-11-14", -14)).toBe("2026-10-31");
});
it("counts days between dates", () => {
  expect(daysBetween("2026-11-14", "2026-11-28")).toBe(14);
  expect(daysBetween("2026-11-28", "2026-11-14")).toBe(-14);
});
it("uses the user's timezone near midnight UTC", () => {
  const now = new Date("2026-11-16T03:30:00Z");
  expect(todayInTimeZone("America/Chicago", now)).toBe("2026-11-15");
  expect(todayInTimeZone("UTC", now)).toBe("2026-11-16");
});

// schedule.test.ts
const s = (frequency: Frequency, anchorDate: string | null, secondDay: number | null = null): Schedule => ({ frequency, anchorDate, secondDay });
it("steps biweekly from the anchor and never before it", () => {
  expect(occurrencesBetween(s("biweekly", "2026-11-13"), "2026-11-01", "2026-12-31")).toEqual(["2026-11-13", "2026-11-27", "2026-12-11", "2026-12-25"]);
  expect(occurrencesBetween(s("biweekly", "2026-11-13"), "2026-10-01", "2026-11-12")).toEqual([]);
});
it("keeps a 31st anchor at month end without drifting", () => {
  expect(occurrencesBetween(s("monthly", "2026-01-31"), "2026-01-01", "2026-05-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
});
it("handles twice-a-month days, including 'last day'", () => {
  expect(occurrencesBetween(s("semimonthly", "2026-11-15", 31), "2026-11-01", "2026-12-31")).toEqual(["2026-11-15", "2026-11-30", "2026-12-15", "2026-12-31"]);
  expect(occurrencesBetween(s("semimonthly", "2026-11-20", 5), "2026-11-01", "2026-12-31")).toEqual(["2026-11-20", "2026-12-05", "2026-12-20"]);
});
it("handles quarterly and leap-day yearly anchors", () => {
  expect(occurrencesBetween(s("quarterly", "2026-01-15"), "2026-01-01", "2026-08-01")).toEqual(["2026-01-15", "2026-04-15", "2026-07-15"]);
  expect(occurrencesBetween(s("yearly", "2024-02-29"), "2025-01-01", "2028-12-31")).toEqual(["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
});
it("irregular income has no expected dates", () => {
  expect(occurrencesBetween(s("irregular", null), "2026-01-01", "2026-12-31")).toEqual([]);
  expect(nextOccurrence(s("irregular", null), "2026-11-14")).toBeNull();
});
it("finds the next occurrence", () => {
  expect(nextOccurrence(s("biweekly", "2026-11-13"), "2026-11-14")).toBe("2026-11-27");
  expect(nextOccurrence(s("biweekly", "2026-11-13"), "2026-10-01")).toBe("2026-11-13");
});
it("converts to a monthly equivalent", () => {
  expect(monthlyEquivalentCents(120_000, "biweekly")).toBe(260_000);
  expect(monthlyEquivalentCents(2_000, "weekly")).toBe(8_667);
  expect(monthlyEquivalentCents(1_200, "yearly")).toBe(100);
});
it("tolerates price changes of up to 20% (at least $2)", () => {
  expect(defaultToleranceCents(1_549)).toBe(310);
  expect(defaultToleranceCents(500)).toBe(200);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/lib/dates src/server/recurring/schedule`
Expected: FAIL (functions missing).

- [ ] **Step 3: Implement** the date helpers, `schedule.ts`, and `recurring-labels.ts`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test src/lib/dates src/server/recurring/schedule`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: calendar-safe date math and recurring schedules"
```

---

### Task 3: Schema, migration, and income/recurring item services

**Files:**
- Modify: `src/server/db/finance-schema.ts`, `src/server/categorize/rules.ts`
- Create: migration `drizzle/0004_*.sql` (generated), `src/server/recurring/items-service.ts`, `src/server/recurring/items-service.test.ts`

**Interfaces:**
- Consumes:
  - `Frequency`, `ScheduledFrequency` from Task 2;
  - `createRule`, `applyRuleToExisting` from `rules-service.ts`;
  - `logActivity`;
  - `parseDateValue(raw, "YYYY-MM-DD")`.
- Produces:
  - **New table `income_sources`:**
    - `id, user_id`;
    - `name text not null`;
    - `type text not null`, one of `IncomeType = "salary" | "hourly" | "freelance" | "benefits" | "side_income" | "other"`;
    - `frequency text not null`;
    - `anchor_date date null` (null if and only if irregular);
    - `second_day int null`;
    - `amount_mode text not null`, one of `AmountMode = "fixed" | "varies" | "estimated"`;
    - `expected_cents bigint(number) null`. This is per occurrence; for irregular income it means per month;
    - `min_cents bigint null`, `max_cents bigint null` (the "typical range" for varies; display only);
    - `account_id → accounts set null`, `category_id → categories set null`;
    - `match_pattern text not null`;
    - `active boolean not null default true`;
    - timestamps;
    - index `(user_id)`.
  - **New table `recurring_rules`:**
    - `id, user_id, name`;
    - `kind text not null`, one of `RecurringKind = "bill" | "subscription" | "transfer"`;
    - `frequency text not null` (never irregular);
    - `anchor_date date not null`, `second_day int null`;
    - `expected_cents bigint(number) not null`;
    - `amount_varies boolean not null default false`;
    - `tolerance_cents int null` (null means `defaultToleranceCents`);
    - `account_id`, `category_id` (set null);
    - `match_pattern text not null`;
    - `active boolean default true`;
    - timestamps;
    - index `(user_id)`.
  - **New table `recurring_dismissals`:** `(id, user_id, merchant_key text not null, created_at)`, unique `(user_id, merchant_key)`.
  - **New `transactions` columns:**
    - `income_source_id → income_sources set null`;
    - `recurring_rule_id → recurring_rules set null`;
    - `expected_date date null`;
    - `match_source text null`, one of `MatchSource = "auto" | "user" | "dismissed"`;
    - unique indexes `(income_source_id, expected_date)` and `(recurring_rule_id, expected_date)`. NULLs stay distinct, so irregular links don't collide.
  - `RuleOrigin` gains `"recurring"`.
  - `rules.ts` exports `containsWords(text: string, pattern: string): boolean`: the existing whole-word test, now reused by `matches()`.
  - `items-service.ts`:
    - `type ItemRef = { kind: "income"; id: string } | { kind: "recurring"; id: string }`
    - `type IncomeSource = typeof incomeSources.$inferSelect`, `type RecurringRule = typeof recurringRules.$inferSelect`
    - `type IncomeSourceInput = { name: string; type: IncomeType; frequency: Frequency; anchorDate: string | null; secondDay: number | null; amountMode: AmountMode; expectedCents: number | null; minCents?: number | null; maxCents?: number | null; accountId: string | null; categoryId: string | null; matchPattern: string; active?: boolean }`
    - `type RecurringRuleInput = { name: string; kind: RecurringKind; frequency: ScheduledFrequency; anchorDate: string; secondDay: number | null; expectedCents: number; amountVaries: boolean; toleranceCents: number | null; accountId: string | null; categoryId: string | null; matchPattern: string; active?: boolean }`
    - `listIncomeSources(db, userId): Promise<IncomeSource[]>`, `listRecurringRules(db, userId): Promise<RecurringRule[]>` (by name)
    - `createIncomeSource(db, userId, input): Promise<IncomeSource>`, `updateIncomeSource(db, userId, id, input: IncomeSourceInput): Promise<IncomeSource>`, `deleteIncomeSource(db, userId, id): Promise<void>`
    - `createRecurringRule`, `updateRecurringRule`, `deleteRecurringRule`: same shapes.
- **Validation** (`ValidationError`, with exactly these messages):
  - `"Give it a name"`: name blank, or longer than 80 characters;
  - `"Enter text to match"`: pattern blank after trimming, or longer than 200 characters;
  - `"Choose the first date"`: a scheduled frequency with a missing or invalid anchor;
  - `"Choose the second day of the month"`: semimonthly without `secondDay` in 1–31, or equal to the anchor's day;
  - `"Irregular only works for income"`: a recurring rule with irregular frequency;
  - `"Enter an amount above $0"`: expected cents ≤ 0 when present.
  - Irregular income forces `anchorDate` and `secondDay` to null.
  - An account or category belonging to someone else throws `NotFoundError`.
- **On create and update with a category:** `createRule({ matchType: "description_contains", pattern: matchPattern, categoryId, createdFrom: "recurring" })`, then `applyRuleToExisting`. Rules are never deleted with the item.
- **Activity:** `income_source.create|update|delete` and `recurring_rule.create|update|delete` (actor `"user"`, before/after snapshots).
- **Delete:** inside one transaction, first clears `match_source`, `expected_date`, and the link on the item's rows, then deletes the item.

- [ ] **Step 1: Write the failing tests**

```ts
const paycheck = (over: Partial<IncomeSourceInput> = {}): IncomeSourceInput => ({
  name: "Paycheck", type: "hourly", frequency: "biweekly", anchorDate: "2026-11-14", secondDay: null,
  amountMode: "varies", expectedCents: null, accountId: checking.id, categoryId: null, matchPattern: "Payroll Acme Corp", ...over,
});
it("creates, lists, updates, and deletes an income source", async () => { /* create → list has 1 with name "Paycheck"; update name "Acme pay" → list shows it; delete → list empty; activity has income_source.create, .update, .delete */ });
it("validates input", async () => {
  await expect(createIncomeSource(t.db, A, paycheck({ matchPattern: "  " }))).rejects.toThrow("Enter text to match");
  await expect(createIncomeSource(t.db, A, paycheck({ frequency: "semimonthly", secondDay: null }))).rejects.toThrow("Choose the second day of the month");
  await expect(createIncomeSource(t.db, A, paycheck({ anchorDate: "2026-02-30" }))).rejects.toThrow("Choose the first date");
  await expect(createRecurringRule(t.db, A, { ...primeVideo, frequency: "irregular" as never })).rejects.toThrow("Irregular only works for income");
  expect((await createIncomeSource(t.db, A, paycheck({ frequency: "irregular", anchorDate: "2026-11-14" }))).anchorDate).toBeNull();
});
it("a category on the item becomes a rule and sorts existing rows", async () => {
  /* Import ufcu-checking. Create paycheck with categoryId = Paycheck. listRules includes
     { matchType: "description_contains", pattern: "payroll acme corp", createdFrom: "recurring" };
     the Payroll Acme Corp row has category Paycheck, source "rule". */
});
it("leaves rows the user categorized alone", async () => { /* Set Payroll row to Gifts via chooseCategory first; after create with Paycheck category it is still Gifts / "user". */ });
it("isolates users", async () => { /* B cannot update or delete A's items (NotFoundError); A cannot use B's account (NotFoundError). */ });
```

`primeVideo: RecurringRuleInput = { name: "Prime Video", kind: "subscription", frequency: "monthly", anchorDate: "2026-11-14", secondDay: null, expectedCents: 2164, amountVaries: false, toleranceCents: null, accountId: checking.id, categoryId: null, matchPattern: "Prime Video" }`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/server/recurring/items-service`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the schema and generate the migration**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: `drizzle/0004_*.sql` contains only `CREATE TABLE`, `ALTER TABLE … ADD COLUMN`, `CREATE [UNIQUE] INDEX`, and FK constraints.

- [ ] **Step 4: Implement `containsWords` and `items-service.ts`**

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: all pass (the Phase 1b rule tests still pass after the `containsWords` refactor).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: income sources and recurring bills, with category rules on save"
```

---

### Task 4: Matching transactions to expected occurrences

**Files:**
- Create: `src/server/recurring/match.ts`, `match.test.ts`, `matching-service.ts`, `matching-service.test.ts`
- Modify: `src/server/recurring/items-service.ts` (re-match after create and update), `src/server/import/service.ts`, `src/server/categorize/pipeline.ts` (`sortTransactions`), `src/server/import/service.test.ts`

**Interfaces:**
- Consumes: Task 2 `occurrencesBetween`, `nextOccurrence`, the constants; Task 3 tables, `ItemRef`, `containsWords`.
- Produces (`match.ts`, pure):
  - `type MatchItem = { ref: ItemRef; direction: "in" | "out"; schedule: Schedule; pattern: string; accountId: string | null; amount: { mode: "any" } | { mode: "near"; cents: number; toleranceCents: number }; allowTransfers: boolean }`
  - `type MatchCandidate = { id: string; date: string; amountCents: number; accountId: string; description: string; merchant: string | null; isTransfer: boolean }`
  - `type MatchLink = { transactionId: string; ref: ItemRef; expectedDate: string | null }`
  - `matchesPattern(pattern: string, t: { description: string; merchant: string | null }): boolean`: `containsWords` on the description or the merchant.
  - `findMatches(items: MatchItem[], candidates: MatchCandidate[], taken: { ref: ItemRef; expectedDate: string }[], window: { from: string; to: string }): MatchLink[]`
- **Algorithm (`findMatches`):**
  - A candidate fits an item when all of these hold:
    - the sign matches the direction;
    - `matchesPattern` is true;
    - the account is the same, or the item has no account;
    - `isTransfer` is false, unless `allowTransfers`;
    - for `near`, `|abs(amount) − cents| ≤ toleranceCents`.
  - **Scheduled items:** the occurrences are `occurrencesBetween(schedule, addDays(window.from, −3), addDays(window.to, 3))` minus `taken`. Every (occurrence, fitting candidate) pair with `|daysBetween| ≤ MATCH_WINDOW_DAYS` is scored by date distance, then amount distance, then earlier candidate date, then candidate id.
  - Pairs are assigned greedily across all items in ascending score. Each candidate and each (item, occurrence) is used at most once.
  - **Irregular items:** after scheduled assignment, each remaining fitting candidate is linked with `expectedDate: null`. Items are tried in input order.
- **Mapping items to `MatchItem`** (in `matching-service.ts`):
  - income: direction `"in"`, `allowTransfers: false`. Amount is `near(expected, defaultToleranceCents(expected))` only when `amountMode = "fixed"` and expected is set; otherwise `any`;
  - bill and subscription: direction `"out"`, `allowTransfers: false`;
  - transfer: direction `"out"`, `allowTransfers: true`;
  - recurring rules: amount is `any` if `amountVaries`, else `near(expected, toleranceCents ?? defaultToleranceCents(expected))`;
  - inactive items are skipped.
- Produces (`matching-service.ts`):
  - `matchRecurring(db: Database, userId: string, range?: { from: string; to: string }): Promise<number>`: links made.
    - **Candidates:** non-excluded rows, date ≥ start date (and within range ±3 days), `match_source IS NULL`. `isTransfer` = pair id set and not `"none"`.
    - **Taken:** linked rows' (ref, expected_date).
    - **Writes:** one transaction. Each UPDATE has the guard `match_source IS NULL AND income_source_id IS NULL AND recurring_rule_id IS NULL` and sets `match_source = 'auto'`. Activity `transaction.auto_match` (actor `"system"`) only for rows updated.
    - **Fill-in:** afterward, any income source with `expected_cents` null and at least one link gets `expected_cents` = the amount of its earliest linked row (activity `income_source.update`, actor `"system"`).
  - `rematchItem(db, userId, ref: ItemRef): Promise<number>`: clears that item's `auto` links (link, expected_date, match_source → null), then `matchRecurring(db, userId)`.
  - `linkTransaction(db, userId, transactionId: string, ref: ItemRef | null): Promise<void>`:
    - `null` means "Not this one": clear the link and set `match_source = 'dismissed'`;
    - a ref sets `match_source = 'user'`, with `expected_date` = the item's occurrence nearest the row's date (null for irregular);
    - any `auto` row already holding that (item, expected_date) is cleared first (its `match_source` back to null);
    - activity `transaction.link_recurring` (actor `"user"`);
    - `NotFoundError` for a row or item belonging to another user.
  - `listMatchOptions(db, userId): Promise<{ ref: ItemRef; name: string; direction: "in" | "out" }[]>`: active items, for the transaction sheet.
- `items-service` create and update call `rematchItem` after saving and after the category rule.
- **`commitImport`:** after categorization, `matched = await matchRecurring(db, userId, { from, to })` in its own try/catch (logged, never thrown). `ImportResult` gains `matched: number`.
- `sortTransactions` also calls `matchRecurring(db, userId)` and returns `matched`.

- [ ] **Step 1: Write the failing pure tests** in `match.test.ts`

```ts
const paycheckItem: MatchItem = { ref: { kind: "income", id: "pay" }, direction: "in", schedule: { frequency: "biweekly", anchorDate: "2026-11-13", secondDay: null }, pattern: "Payroll Acme Corp", accountId: "chk", amount: { mode: "any" }, allowTransfers: false };
const tx = (id: string, date: string, amountCents: number, description: string, over: Partial<MatchCandidate> = {}): MatchCandidate => ({ id, date, amountCents, accountId: "chk", description, merchant: description, isTransfer: false, ...over });
const win = { from: "2026-11-01", to: "2026-12-31" };

it("matches a varying paycheck that arrives a day early", () => {
  expect(findMatches([paycheckItem], [tx("a", "2026-11-12", 98_000, "Payroll Acme Corp"), tx("b", "2026-11-26", 20_000, "Payroll Acme Corp")], [], win)).toEqual([
    { transactionId: "a", ref: paycheckItem.ref, expectedDate: "2026-11-13" },
    { transactionId: "b", ref: paycheckItem.ref, expectedDate: "2026-11-27" },
  ]);
});
it("ignores rows outside ±3 days, the wrong direction, or another account", () => {
  expect(findMatches([paycheckItem], [tx("a", "2026-11-17", 98_000, "Payroll Acme Corp"), tx("b", "2026-11-13", -98_000, "Payroll Acme Corp"), tx("c", "2026-11-13", 98_000, "Payroll Acme Corp", { accountId: "sav" })], [], win)).toEqual([]);
});
it("assigns same-merchant charges to the item whose amount fits", () => {
  /* Two monthly "out" items, anchor 2026-11-03, pattern "apple.com/bill": small (near 99, tol 200) and big (near 999, tol 200).
     Candidates: x on 11-03 for -999; y on 11-04 for -99. Expect big↔x and small↔y, both expectedDate "2026-11-03". */
});
it("one transaction per occurrence, nearest first", () => {
  /* Monthly Netflix item anchored 2026-11-04 (near 1549). Rows on 11-03 and 11-05, both -1549.
     Exactly one link: the 11-03 row (tie → earlier date). */
});
it("respects occurrences already fulfilled", () => {
  /* paycheckItem with taken [{ ref, expectedDate: "2026-11-13" }]; row on 11-12 → no link. */
});
it("tolerates a price change within 20% but not a different charge", () => {
  /* Monthly item near 1549, tol defaultToleranceCents(1549)=310: row -1799 links; separate run with row -2500 → none. */
});
it("links every deposit of irregular income, with no expected date", () => {
  /* Irregular item, pattern "Venmo", "in": rows +5000 on 11-02 and +7000 on 11-20 → two links with expectedDate null; a -3000 Venmo row is not linked. */
});
it("only transfer items take transfer-paired rows", () => {
  /* A monthly bill item and a monthly transfer item, both pattern "Transfer To Share", out, any amount, anchors 2026-11-12.
     Row on 11-12, -10000, isTransfer true → linked to the transfer item only. */
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/server/recurring/match`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `match.ts`**

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test src/server/recurring/match`
Expected: PASS.

- [ ] **Step 5: Write the failing service tests** in `matching-service.test.ts` (start date 2026-11-07; `checking` holds ufcu-checking unless stated)

```ts
it("links the paycheck when the import arrives and reports it", async () => {
  /* Create paycheck (anchor 2026-11-14, biweekly, varies, pattern "Payroll Acme Corp") BEFORE importing.
     commitImport(ufcu-checking) → result.matched === 1; the Payroll row has incomeSourceId = paycheck.id,
     expectedDate "2026-11-14", matchSource "auto"; activity has one transaction.auto_match. */
});
it("creating an item matches rows already imported", async () => { /* import first, then create paycheck → row linked. */ });
it("editing the schedule re-matches", async () => {
  /* Create with anchor 2026-11-10 (occurrences 11-10, 11-24; 11-14 is 4 days off) → Payroll row unlinked.
     updateIncomeSource with anchor 2026-11-14 → linked with expectedDate "2026-11-14". */
});
it("never re-links a dismissed row and keeps manual links on rematch", async () => {
  /* Paycheck linked automatically. linkTransaction(row, null) → matchSource "dismissed", no incomeSourceId.
     rematchItem(paycheck) and matchRecurring → still dismissed.
     Create bill "Prime" (pattern "Prime Video"); linkTransaction(primeRow, { kind: "recurring", id: prime.id }) → matchSource "user".
     updateRecurringRule(prime, pattern "Nope") → primeRow still linked, matchSource "user". */
});
it("a manual link takes the nearest occurrence and bumps an automatic claimant", async () => {
  /* Monthly bill "Coffee club", pattern "Bennu Coffee", anchor 2026-11-13, near 625 → one Bennu row auto-linked (11-13).
     linkTransaction(otherBennuRow, ref) → otherBennuRow: matchSource "user", expectedDate "2026-11-13";
     the first row: link null, matchSource null. */
});
it("fills a missing expected amount from the first matched deposit", async () => { /* expectedCents null → after match, listIncomeSources()[0].expectedCents === 120_000. */ });
it("deleting an item clears its links", async () => { /* delete paycheck → Payroll row incomeSourceId null, matchSource null, expectedDate null. */ });
it("skips hidden rows and rows before the start date", async () => {
  /* insertTestTransaction "Payroll Acme Corp" +120000 on 2026-11-06 (before start; insert directly) and hide the 11-14 row
     via setHidden → create an IRREGULAR income source, pattern "Payroll Acme Corp" (it would link any fitting row) → no links. */
});
it("isolates users", async () => { /* B: linkTransaction on A's row → NotFoundError; matchRecurring(B) never links A's rows. */ });
```

Also update `src/server/import/service.test.ts`: the existing ImportResult equality assertions gain `matched: 0`.

- [ ] **Step 6: Run to verify they fail**

Run: `pnpm test src/server/recurring src/server/import`
Expected: the new service tests FAIL. The import assertions fail on the missing `matched`.

- [ ] **Step 7: Implement `matching-service.ts`** and wire it into items-service, `commitImport`, and `sortTransactions`.

- [ ] **Step 8: Run to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: match imported transactions to expected paychecks and bills"
```

---

### Task 5: Status, planning amounts, and the overview

**Files:**
- Create: `src/server/recurring/status.ts`, `status.test.ts`, `overview.ts`, `overview.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces (`status.ts`, pure):
  - `type ItemState = "paused" | "irregular" | "late" | "awaiting" | "due_soon" | "upcoming"`
  - `itemStatus(input: { schedule: Schedule; active: boolean; fulfilled: Set<string>; startDate: string; today: string; dataThrough: string | null }): { state: ItemState; nextDate: string | null; lateDates: string[]; awaitingDates: string[] }`
  - **Rules:**
    - Occurrences counted start at `max(startDate, anchorDate)`.
    - For an unfulfilled occurrence `d ≤ today`: it is late if `dataThrough` exists and `addDays(d, MATCH_WINDOW_DAYS) ≤ dataThrough`; otherwise it is awaiting.
    - `nextDate` = the first unfulfilled occurrence ≥ today.
    - State precedence: `paused` (inactive; no late or awaiting lists), then `irregular` (no schedule), then `late`, then `awaiting`, then `due_soon` (`nextDate ≤ today + DUE_SOON_DAYS`), then `upcoming`.
  - `planningAmount(input: { mode: AmountMode | "fixed_rule" | "varies_rule"; expectedCents: number | null; irregular: boolean; matches: { date: string; amountCents: number }[]; today: string }): { cents: number | null; basis: "set" | "estimate" | "history" | "unknown" }`. Match amounts are absolute.
    - `fixed` and `fixed_rule`: `{ expected, "set" }`.
    - `varies` and `varies_rule`: `{ expected, "set" }` when set; otherwise the latest match, `"history"`; with no matches, `{ null, "unknown" }`.
    - `estimated`: history exists when the earliest match is on or before `today − ESTIMATE_LOOKBACK_DAYS`. If so, use the rounded mean of matches in the last 90 days (scheduled) or their sum ÷ 3, rounded (irregular), with basis `"history"`. Otherwise `{ expected, "estimate" }`, or `{ null, "unknown" }`.
- Produces (`overview.ts`):
  - `type RecurringItemView = { ref: ItemRef; name: string; kind: "income" | RecurringKind; frequency: Frequency; amountCents: number | null; amountBasis: "set" | "estimate" | "history" | "unknown"; monthlyCents: number | null; state: ItemState; nextDate: string | null; lateDates: string[]; awaitingDates: string[]; lastMatch: { date: string; amountCents: number } | null; recentMatches: { transactionId: string; date: string; amountCents: number }[]; accountName: string | null; categoryName: string | null; item: IncomeSource | RecurringRule }`
  - `type RecurringOverview = { today: string; income: RecurringItemView[]; bills: RecurringItemView[]; monthlyIncomeCents: number; monthlyBillsCents: number; hasStartDate: boolean }`
  - `getRecurringOverview(db: Database, userId: string, now?: Date): Promise<RecurringOverview>`
- **Details:**
  - `today = todayInTimeZone(settings.timezone, now)`.
  - `dataThrough` = the latest non-excluded, non-pending transaction date in the item's account (any account when the item has none).
  - `fulfilled` = the item's linked `expected_date`s.
  - `recentMatches`: the latest 6, absolute amounts.
  - `monthlyCents`: `monthlyEquivalentCents(amountCents, frequency)` for scheduled items, `amountCents` for irregular (already monthly), null if the amount is null.
  - Totals sum active items only.
  - `bills` includes the bill, subscription, and transfer kinds; transfers are excluded from `monthlyBillsCents`.
  - Order: income by name; bills by `nextDate`, then name.
  - Without a start date: empty lists and `hasStartDate: false`.

- [ ] **Step 1: Write the failing pure tests** in `status.test.ts`

```ts
const pay: Schedule = { frequency: "biweekly", anchorDate: "2026-11-13", secondDay: null };
const base = { schedule: pay, active: true, fulfilled: new Set<string>(), startDate: "2026-11-07" };
it("does not call an occurrence late when no data covers it yet", () => {
  expect(itemStatus({ ...base, today: "2026-12-01", dataThrough: "2026-11-15" })).toEqual({ state: "awaiting", nextDate: "2026-12-11", lateDates: [], awaitingDates: ["2026-11-13", "2026-11-27"] });
});
it("flags a missed paycheck once later data exists", () => {
  expect(itemStatus({ ...base, today: "2026-12-01", dataThrough: "2026-11-20" })).toMatchObject({ state: "late", lateDates: ["2026-11-13"], awaitingDates: ["2026-11-27"] });
});
it("an early payment fulfils its date and moves next forward", () => {
  expect(itemStatus({ ...base, fulfilled: new Set(["2026-11-13", "2026-11-27"]), today: "2026-11-26", dataThrough: "2026-11-26" })).toEqual({ state: "upcoming", nextDate: "2026-12-11", lateDates: [], awaitingDates: [] });
});
it("ignores occurrences before the tracking start date", () => {
  expect(itemStatus({ ...base, schedule: { ...pay, anchorDate: "2026-10-02" }, today: "2026-11-14", dataThrough: "2026-11-14" }).awaitingDates).toEqual(["2026-11-13"]);
});
it("is due soon within 7 days, and paused items never go late", () => {
  expect(itemStatus({ ...base, fulfilled: new Set(["2026-11-13"]), today: "2026-11-21", dataThrough: "2026-11-21" }).state).toBe("due_soon");
  expect(itemStatus({ ...base, active: false, today: "2026-12-31", dataThrough: "2026-12-31" })).toMatchObject({ state: "paused", lateDates: [] });
});
it("plans with the user's estimate until 3 months of deposits exist", () => {
  const m = (date: string, amountCents: number) => ({ date, amountCents });
  expect(planningAmount({ mode: "estimated", expectedCents: 100_000, irregular: false, matches: [m("2026-10-01", 80_000)], today: "2026-11-14" })).toEqual({ cents: 100_000, basis: "estimate" });
  expect(planningAmount({ mode: "estimated", expectedCents: 100_000, irregular: false, matches: [m("2026-08-01", 80_000), m("2026-10-01", 90_000), m("2026-11-01", 120_000)], today: "2026-11-14" })).toEqual({ cents: 105_000, basis: "history" });
  expect(planningAmount({ mode: "estimated", expectedCents: 50_000, irregular: true, matches: [m("2026-08-01", 30_000), m("2026-09-01", 30_000), m("2026-10-20", 60_000)], today: "2026-11-14" })).toEqual({ cents: 30_000, basis: "history" });
  expect(planningAmount({ mode: "varies", expectedCents: null, irregular: false, matches: [m("2026-11-14", 120_000)], today: "2026-11-14" })).toEqual({ cents: 120_000, basis: "history" });
  expect(planningAmount({ mode: "varies", expectedCents: null, irregular: false, matches: [], today: "2026-11-14" })).toEqual({ cents: null, basis: "unknown" });
});
```

The 105 000 case: within the 90 days before 2026-11-14 (on or after 2026-08-16) the matches are 90 000 and 120 000, so the mean is 105 000. The irregular case: the in-window matches 30 000 (09-01) and 60 000 (10-20) sum to 90 000, and 90 000 ÷ 3 = 30 000.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/server/recurring/status`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `status.ts`**, then run the same command.
Expected: PASS.

- [ ] **Step 4: Write the failing overview tests** in `overview.test.ts`

```ts
const now = new Date("2026-11-15T18:00:00Z");
it("summarizes the owner's paycheck and a subscription", async () => {
  /* Import ufcu-checking; create paycheck (biweekly, anchor 2026-11-14, fixed, expected 120000, pattern "Payroll Acme Corp")
     and Prime Video (monthly, anchor 2026-11-14, 2164). getRecurringOverview(now):
     income[0] ⊇ { name: "Paycheck", lastMatch: { date: "2026-11-14", amountCents: 120000 }, nextDate: "2026-11-28", state: "upcoming", monthlyCents: 260000, amountBasis: "set" };
     bills[0] ⊇ { name: "Prime Video", lastMatch: { date: "2026-11-14", amountCents: 2164 }, nextDate: "2026-12-14", monthlyCents: 2164 };
     monthlyIncomeCents 260000, monthlyBillsCents 2164, today "2026-11-15". */
});
it("judges lateness by each account's own data", async () => {
  /* Savings account with one row dated 2026-11-30 (insertTestTransaction); a bill on CHECKING monthly anchor 2026-11-12,
     pattern "Nothing Here", 1000. now = 2026-12-01T18:00Z → state "awaiting", awaitingDates ["2026-11-12"]
     (checking data ends 11-14 and 11-12 + 3 = 11-15 is past it), not "late", even though savings has data through 11-30. */
});
it("leaves transfers out of the bills total and paused items out of all totals", async () => { /* transfer rule 40000 and a paused bill 999 → monthlyBillsCents excludes both. */ });
it("returns nothing before a start date is set, and isolates users", async () => { /* user without a start date → hasStartDate false, empty lists; B sees none of A's items. */ });
```

- [ ] **Step 5: Run to verify they fail**, implement `overview.ts`, then run again.

Run: `pnpm test src/server/recurring`
Expected: FAIL before the implementation, PASS after.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: recurring status (late vs waiting for import), planning amounts, and overview"
```

---

### Task 6: Light detection of repeating charges and deposits

**Files:**
- Create: `src/server/recurring/detect.ts`, `detect.test.ts`, `suggestions-service.ts`, `suggestions-service.test.ts`

**Interfaces:**
- Consumes: Task 2 `addDays`/`daysBetween`; Task 4 `matchesPattern`; Task 3 `recurring_dismissals`.
- Produces (`detect.ts`, pure):
  - `type DetectRow = { date: string; amountCents: number; merchant: string | null; accountId: string; categoryId: string | null }`
  - `type Suggestion = { merchantKey: string; merchant: string; direction: "in" | "out"; frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly"; amountCents: number; amountVaries: boolean; count: number; lastDate: string; nextDate: string; accountId: string; categoryId: string | null }`
  - `detectRecurring(rows: DetectRow[], dataThrough: string): Suggestion[]`
- **Algorithm:**
  - Group by direction and `merchant.toLowerCase()` (skip a null merchant). Keep groups of 3 or more rows. Sort dates; `gaps` = consecutive day differences; `median` = the lower middle of the sorted values.
  - Classify the median gap. Each frequency has a nominal interval, a median range, and a tolerance:

    | Frequency | Nominal (days) | Median range | Tolerance |
    |---|---|---|---|
    | weekly | 7 | 6–8 | 1 |
    | biweekly | 14 | 13–15 | 2 |
    | monthly | 30 | 27–33 | 4 |
    | quarterly | 91 | 85–97 | 7 |
    | yearly | 365 | 355–375 | 10 |

  - Require at least 75% of gaps within the tolerance of the median.
  - Require recency: `daysBetween(lastDate, dataThrough) ≤ nominal × 1.5 + tolerance`.
  - Amounts:
    - `amountCents` = the median absolute amount;
    - `amountVaries` = `(max − min) / median > 0.2`.
  - Next date: monthly, quarterly, and yearly use `occurrencesBetween` from `lastDate`; the rest use `addDays(lastDate, nominal)`.
  - Account and category: the most common in the group.
  - Order: count descending, then merchant.
- Produces (`suggestions-service.ts`):
  - `type SuggestionView = Suggestion & { kindGuess: "income" | "bill" | "subscription"; accountName: string; categoryName: string | null }`. `kindGuess`: `in` means income; `out` with category "Subscriptions" or "Entertainment" means subscription; otherwise bill.
  - `listSuggestions(db, userId, limit = 5): Promise<SuggestionView[]>`
    - **Input rows:** non-excluded, not transfer-paired (pair null or `"none"`), not linked, date ≥ start.
    - **dataThrough:** the latest such row's date.
    - **Dropped:** suggestions whose merchant matches any item's pattern (`matchesPattern` on the merchant), and dismissed `merchantKey`s.
  - `dismissSuggestion(db, userId, merchantKey: string): Promise<void>`: upsert; activity `recurring_suggestion.dismiss`.

- [ ] **Step 1: Write the failing tests**

```ts
// detect.test.ts
const r = (date: string, amountCents: number, merchant = "Netflix"): DetectRow => ({ date, amountCents, merchant, accountId: "chk", categoryId: "subs" });
it("spots a steady monthly subscription", () => {
  expect(detectRecurring(["2026-08-03", "2026-09-03", "2026-10-03", "2026-11-03"].map((d) => r(d, -1549)), "2026-11-15")).toEqual([
    { merchantKey: "netflix", merchant: "Netflix", direction: "out", frequency: "monthly", amountCents: 1549, amountVaries: false, count: 4, lastDate: "2026-11-03", nextDate: "2026-12-03", accountId: "chk", categoryId: "subs" },
  ]);
});
it("spots a biweekly paycheck that varies", () => {
  const rows = [["2026-09-18", 60_000], ["2026-10-02", 98_000], ["2026-10-16", 120_000], ["2026-10-30", 110_000], ["2026-11-13", 100_000]].map(([d, c]) => r(d as string, c as number, "Acme Payroll"));
  expect(detectRecurring(rows, "2026-11-15")[0]).toMatchObject({ direction: "in", frequency: "biweekly", amountCents: 100_000, amountVaries: true, nextDate: "2026-11-27" });
});
it("ignores irregular spending, stale patterns, and short histories", () => {
  expect(detectRecurring(["2026-10-01", "2026-10-04", "2026-10-24", "2026-11-14"].map((d) => r(d, -900, "Haymaker")), "2026-11-15")).toEqual([]);
  expect(detectRecurring(["2026-03-03", "2026-04-03", "2026-05-03"].map((d) => r(d, -999)), "2026-11-15")).toEqual([]);
  expect(detectRecurring(["2026-10-03", "2026-11-03"].map((d) => r(d, -999)), "2026-11-15")).toEqual([]);
});

// suggestions-service.test.ts
it("suggests untracked repeats, guessing the kind", async () => { /* 4 monthly Netflix rows (-1549, category Subscriptions) via insertTestTransaction → one suggestion, kindGuess "subscription", categoryName "Subscriptions". */ });
it("drops merchants already tracked or dismissed", async () => { /* create a recurring rule with pattern "Netflix" → []; separately, dismissSuggestion("netflix") → []. */ });
it("ignores transfers and linked rows", async () => { /* 4 monthly rows with transferPairId set → []. */ });
it("isolates users", async () => { /* B sees no suggestions from A's rows; B's dismissal doesn't hide A's. */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/server/recurring/detect src/server/recurring/suggestions`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** `detect.ts` and `suggestions-service.ts`, then run the same command.
Expected: PASS.

- [ ] **Step 4: Real-data dry run (counts only, nothing saved to the repo)**

Write a scratch script in the session scratchpad (not the repo). It parses `~/finnance-samples/*.csv` with `parseImportFile` + `normalizeMerchant`, keeps rows dated on or after 2026-05-01, and runs `detectRecurring` per file with `dataThrough` = the file's last date. It prints only counts per frequency and direction, never merchant names or amounts.
Expected: the UFCU checking file yields at least one biweekly `in` suggestion and at least one monthly `out` suggestion. If not, rule on the thresholds in the ledger before going on.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: suggest tracking repeating charges and deposits"
```

---

### Task 7: Recurring page

**Files:**
- Modify: `src/app/(app)/recurring/page.tsx` (replace the Phase 1c empty state), `e2e/global-setup.ts`
- Create: `src/app/(app)/recurring/actions.ts`, `src/components/recurring/{recurring-summary.tsx,item-card.tsx,item-dialog.tsx,suggestion-list.tsx}`, `e2e/recurring.spec.ts`

**Interfaces:**
- Consumes: `getRecurringOverview`, `listSuggestions`, `dismissSuggestion`, the items-service CRUD, `listAccounts`, `listCategories`, `FREQUENCY_LABELS` / `KIND_LABELS` / `INCOME_TYPE_LABELS`, and `formatCents`, `formatDisplayDate`.
- Produces:
  - **Server Actions** (`recurring/actions.ts`; each calls `requireUser()`, parses with Zod, revalidates `/recurring` and `/transactions`, and returns `{ error: string }` on `ValidationError`/`NotFoundError`/`ZodError`):
    - `saveItem(formData: FormData): Promise<{ ref: ItemRef } | { error: string }>`. Fields:
      - `id?`, `kind` (`income|bill|subscription|transfer`), `name`, `frequency`, `anchorDate`, `secondDay?`;
      - `amount` (dollars text → cents via `parseAmountToCents`, absolute). It is optional for income (blank → null: "set by your first deposit") and required for the other kinds;
      - `amountMode` (income only), `incomeType` (income only), `amountVaries` (rules only);
      - `accountId?`, `categoryId?`, `matchPattern`.
      - Changing kind between income and a rule on edit is not allowed (the dialog locks it).
    - `deleteItem(ref: ItemRef): Promise<{ ok: true } | { error: string }>`
    - `dismissSuggestionAction(merchantKey: string): Promise<{ ok: true } | { error: string }>`
  - **`ItemDialog`** (client), exported for Task 8: `ItemDialog({ open, onOpenChange, accounts, categories, initial }: { …; initial?: ItemDraft })`.
    - `type ItemDraft = Partial<{ id: string; kind: "income" | RecurringKind; name: string; frequency: Frequency; anchorDate: string; secondDay: number | null; amountCents: number | null; amountMode: AmountMode; incomeType: IncomeType; amountVaries: boolean; accountId: string | null; categoryId: string | null; matchPattern: string }>`
    - Defaults for a new item:
      - kind income: frequency biweekly, amount mode varies, income type salary, category "Paycheck";
      - kind subscription: frequency monthly, category "Subscriptions".
    - Field labels:
      - "Name";
      - "How often";
      - "First date", with the hint "Repeats from this date. Use a recent one.";
      - "Second day" (semimonthly only; options 1–30 plus "Last day" = 31);
      - "Amount";
      - "Amount is" (Same every time / Varies / Estimate from deposits), income only;
      - "Amount varies" checkbox, rules only;
      - "Account" ("Any account");
      - "Category" ("None");
      - "Match text", with the hint "Words in the bank description, like Payroll Acme".
    - Buttons: "Save", and "Delete" when editing.
- **Page layout** (mobile-first; follow existing Card/Badge/PageHeader patterns and `.num` money; right-aligned amounts):
  1. `PageHeader` "Recurring", "Paychecks, bills, and subscriptions, entered once." Then the "Add" button (opens a blank `ItemDialog`).
  2. Without a start date: the existing empty state pointing to Accounts.
  3. **Suggestions** (if any): "Looks like {merchant}, {formatCents(amount)} {frequency label lowercase}. Track it?" Buttons **Track** (opens a prefilled `ItemDialog`: name and match text = merchant; anchor = `lastDate`; kind = `kindGuess`) and **Dismiss**.
  4. **`RecurringSummary`**: "Income ≈ {monthlyIncome}/mo" and "Bills & subscriptions ≈ {monthlyBills}/mo".
  5. **"Income"** and **"Bills & subscriptions"** sections of `ItemCard`s. Empty states: "Add your paycheck — Finnance will expect it and match it when it arrives." and "Add bills and subscriptions, or track one from Transactions."
- **`ItemCard`** shows:
  - name; frequency label; amount, with `≈` when the basis is estimate or history; "Amount set by your first deposit" when unknown;
  - "Next {date}" (or "Irregular");
  - "Last {date} · {amount}", or "Not seen yet";
  - a state chip. Red is used only for late:
    - late: "Late · expected {first late date}";
    - awaiting: "Waiting for import";
    - due_soon: "Due {date}" (income: "Expected {date}");
    - paused: "Paused".
  - Tapping opens `ItemDialog` with the item, plus a "Recent" list of `recentMatches`.
- **e2e:**
  - Add `RECURRING_USER` and `RECURRING_TRACK_USER` (exports in `e2e/fixtures.ts`) to `global-setup`, each seeded like `TXN_USER` (`seeded(…, [CHECKING])`). Playwright runs `fullyParallel`, so each test gets its own user.
  - `e2e/recurring.spec.ts`, test `adds a bill and sees it matched`: sign in as RECURRING_USER → `/recurring` → Add → kind Subscription, Name "Prime Video", How often Monthly, First date 2026-11-14, Amount 21.64, Match text "Prime Video" → Save → the card "Prime Video" shows "Last Nov 14, 2026" and "$21.64", with no "Late" text.
  - Assertions avoid "Next" dates, because they depend on the real clock.

- [ ] **Step 1: Read the Next docs** for Server Actions and forms in `node_modules/next/dist/docs/` (the same pages Phase 1b used for the rules page).
- [ ] **Step 2: Write the failing e2e** (`e2e/recurring.spec.ts` + seed).

Run: `pnpm test:e2e e2e/recurring.spec.ts`
Expected: FAIL (no Add button).

- [ ] **Step 3: Implement the actions, components, and page.**
- [ ] **Step 4: Run to verify**

Run: `pnpm typecheck && pnpm lint && pnpm test:e2e e2e/recurring.spec.ts`
Expected: PASS.

- [ ] **Step 5: Look at it on a phone width** (Playwright screenshot at 390×844 into the scratchpad) and fix anything cramped or overflowing.
- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Recurring page with paychecks, bills, suggestions, and status"
```

---

### Task 8: Transactions and import: see, fix, and start tracking

**Files:**
- Modify:
  - `src/server/finance/transactions.ts` + `transactions.test.ts`;
  - `src/app/(app)/transactions/{page.tsx,actions.ts}`;
  - `src/components/transactions/{transaction-sheet.tsx,transaction-list.tsx}`;
  - `src/components/import/file-card.tsx`;
  - `e2e/recurring.spec.ts`.

**Interfaces:**
- Consumes: `linkTransaction`, `listMatchOptions`, `ItemDialog`/`ItemDraft` (Task 7), `ImportResult.matched`.
- Produces:
  - `TransactionRow.match: { kind: "income" | "recurring"; id: string; name: string; expectedDate: string | null; source: "auto" | "user" } | null`. It comes from left joins to `income_sources` and `recurring_rules`; it is null when the row is unlinked or dismissed.
  - Server Action `linkRecurringAction(transactionId: string, ref: ItemRef | null): Promise<{ row: TransactionRow } | { error: string }>`.
  - The transactions page passes `matchOptions` (from `listMatchOptions`), plus accounts and categories, to the sheet.
- **Sheet** (a new "Recurring" block under the category):
  - **Matched:** "{name} · expected {date}" (irregular: just the name) and a **Not this one** button, which calls `linkRecurringAction(id, null)`.
  - **Unmatched:**
    - a "Part of" select with the `matchOptions` whose direction fits the row's sign, which calls `linkRecurringAction(id, ref)`;
    - a **Track as recurring** button that opens `ItemDialog` with this draft: kind = income if money in, else bill; name = merchant ?? description; match text = merchant ?? description; anchor = row date; amount = absolute amount; account and category = the row's.
- **List:** matched rows show a small `Repeat` icon (lucide) with `aria-label="Recurring: {name}"` next to the description.
- **Import summary** (`file-card.tsx`): when `matched > 0`, add the part "{n} matched to recurring" to the existing summary parts.

- [ ] **Step 1: Write the failing tests**

```ts
// transactions.test.ts
it("shows which recurring item a row fulfils", async () => {
  /* Import ufcu-checking, create paycheck (anchor 2026-11-14, pattern "Payroll Acme Corp").
     listTransactions → Payroll row .match ⊇ { kind: "income", name: "Paycheck", expectedDate: "2026-11-14", source: "auto" };
     other rows .match === null; after linkTransaction(row, null) → .match === null. */
});
```

```ts
// e2e/recurring.spec.ts
test("tracks the paycheck from a transaction, then un-matches it", async ({ page }) => {
  /* RECURRING_TRACK_USER → /transactions → open "Payroll Acme Corp" → Track as recurring → the dialog shows Name "Payroll Acme Corp",
     kind Income, Amount "1200.00" (prefill is (cents / 100).toFixed(2)) → How often "Every 2 weeks" → Save.
     Close and reopen the row's sheet → it shows "Payroll Acme Corp · expected Nov 14, 2026".
     /recurring shows the income card with "Last Nov 14, 2026".
     Back on /transactions, open the row → Not this one → the "Part of" select appears. */
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/server/finance/transactions && pnpm test:e2e e2e/recurring.spec.ts`
Expected: the new unit test and the new e2e test FAIL.

- [ ] **Step 3: Implement** the row field, action, sheet block, list icon, and import summary.
- [ ] **Step 4: Run to verify**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: all pass. Import e2e assertions on summary text still hold, because the fixture import matches nothing for users with no items.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: see and fix recurring matches on transactions; track one from a transaction"
```

---

### Task 9: Ship and owner acceptance

**Files:**
- Modify: `docs/setup.md` (new section "12. Add your paycheck and bills"), `README.md` (status line: Phase 1c)

- [ ] **Step 1: Write the owner's steps** in `docs/setup.md`:
1. In **Transactions**, open your most recent paycheck deposit and tap **Track as recurring**. Choose **Every 2 weeks**, leave **Amount is: Varies**, and save. Finnance links each paycheck from now on.
2. Do the same for each bill or subscription you see. Or open **Recurring → Add**. Finnance also suggests repeating charges it notices; tap **Track** or **Dismiss**.
3. After each monthly import, the summary says how many items matched. **Recurring** shows anything **Late** (expected, and your imported data covers that date, but it never arrived) or **Waiting for import**.

✅ Your latest paycheck shows under **Recurring → Income** with its date, and the next payday is two weeks later.

- [ ] **Step 2: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build`
Expected: all pass.

- [ ] **Step 3: Owner checkpoint.** Ask for the go-ahead to merge to `main` and push. This deploys, and the build runs migration `0004`.

After deploy, run: `curl -s -o /dev/null -w "%{http_code}" https://finnance-tau.vercel.app/recurring`
Expected: `307` (redirects to sign-in).

- [ ] **Step 4: Owner acceptance** (the remaining part of Phase 1's "done when")
- The owner tracks their paycheck from a deposit. **Recurring** shows it as received, with the next payday 14 days later.
- On the next import, the summary includes "1 matched to recurring", and the paycheck links without any manual step.
- The monthly bills total looks right after adding or tracking their subscriptions.
- After acceptance, delete this plan's `.superpowers/sdd/` workspace.
