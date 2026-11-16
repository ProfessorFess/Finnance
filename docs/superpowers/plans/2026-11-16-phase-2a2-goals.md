# Phase 2a-2: Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Goals track themselves from the money that actually moves:
- **What counts:** transfers into a goal's account, spending in a goal's category, money added by hand, and transactions linked to the goal.
- **What it shows:** each goal projects its finish date from the user's real recent pace (or their plan, until 3 months of history exist), says whether it's ahead or behind, and how much it needs per month.
- **Priority:** goals sit in order, so "emergency fund first, then Roth IRA" works, and a reached goal prompts before money rolls to the next one.

**Architecture:**
- **Records first:** a goal's progress is its starting amount plus `goal_contributions` rows. Those rows come from automatic crediting (matched transactions), manual entry, or linking a transaction. Planned amounts are optional overlays used only for projections.
- **A pure projection module** (`src/server/goals/projection.ts`), plus DB services `goals-service.ts`, `credit-service.ts`, and `overview.ts`, all taking `(db, userId, …)` and Zod-validated (assistant-ready).
- **Crediting runs after import**, like recurring matching, and never fails an import.

**Tech Stack:** Phase 2a-1 stack. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-finnance-design.md`. Sections:
- 1 (Guiding principle);
- 6, "Goals";
- 7.5 (goal projections fall back to the plan until 3 months exist);
- 9 (Goals: progress, projection, cards, priority order);
- 10 (Goals page);
- 11 (goals are assistant blocks).

## Global Constraints

- **Earlier phases' constraints still apply.** Everything in Phase 1a–2a-1's Global Constraints:
  - read the bundled Next docs before writing Next code;
  - money in integer cents and calendar dates as `YYYY-MM-DD` strings, never `new Date(dateString)`;
  - `userId`-scoped services;
  - Server Actions call `requireUser()` and validate with Zod;
  - an activity-log row on every change;
  - migrations are add-only;
  - no real bank data in the repo;
  - no real API calls in tests.
- **The guiding principle, applied:**
  - Progress is records (contributions). A goal works with no plan, no bucket, and no target.
  - A goal's automatic counting is one optional block: **moves into an account** (transfer-paired inflows) or **spending in a category** (outflows), never both.
  - Nothing names the owner's goals outside tests.
- **Crediting rules:**
  - A transaction counts toward **at most one goal** (unique `goal_contributions.transaction_id`).
  - It counts only for goals with status `active` whose `start_date ≤ transaction date`.
  - Among several matching goals, the one with the lowest `priority` number wins.
  - A goal that has reached its target but is still `active` keeps receiving money until the user marks it done. **No silent roll-over** (spec 9: "with a prompt").
  - Hidden transactions (`status = 'excluded'`) never count, and contributions linked to them drop out of progress.
- **Projection rules:**
  - **Progress** = `starting_cents` + the sum of counted contributions.
  - **Pace:**
    - With history: if the earliest counted contribution is on or before `today − 90 days`, pace = the sum of contributions in `[today − 90, today]` ÷ 3, basis `"actual"`.
    - Otherwise, the planned monthly amount, basis `"plan"`.
    - With neither, null.
  - **Planned monthly:**
    - `planned_per = 'month'` → `planned_cents`;
    - `planned_per = 'income'` → `planned_cents × incomesPerMonth` (from the plan status);
    - none, with `funded_by_bucket_id` → that bucket's `monthlyCents`;
    - else null.
  - **Dates:**
    - Projected date = `addMonths(today, ceil(remaining / pace))`.
    - Needed per month = `ceil(remaining / monthsUntil)`, where `monthsUntil = max(1, round(daysBetween(today, targetDate) / 30.4375))`. A past target date needs everything now.
  - **Chip:**
    - `done` when the target is reached or the goal is completed;
    - `null` without a target;
    - with a target date: `ahead` if projected ≤ `addMonths(targetDate, −1)`, `on_track` if ≤ the target date, else `behind` (also `behind` with no pace);
    - without a target date: `on_track` with a pace, else `null`.
  - **Horizon:** `short` when (target date ?? projected date) is within 365 days, `long` beyond, `null` with neither.
- **Copy:**
  - status chips: "Done", "Ahead", "On track", "Behind";
  - the plan basis is labeled "your plan" and the history basis "your recent pace" (spec 7.5: "say so").
- **Carry-overs folded in** (`phase-2a1-deferred-review-items`):
  - item 6: buffer semantics. A buffer bucket with a destination tracks moves like savings; without one, it tracks its categories. This aligns with spec 6.
  - item 3: copy.
- **Out of scope:**
  - linking a goal to an account balance (Phase 3);
  - the goal-progress Home widget (2a-3);
  - the assistant (2b);
  - goal-funding buckets that auto-switch destination accounts. A roll-over moves *credit* to the next goal; the user changes accounts themselves.
- **Shorthand tests:** a test shown with a `/* … */` body states its exact setup and assertion. Write it out with the existing helpers (`createTestUser`, `createAccount`, `insertTestTransaction`, `listCategories`, `setTrackingStartDate`, `createPlan`, `templateDrafts`, `getPlanStatus`). A transfer pair is two `insertTestTransaction` rows updated to share a `transferPairId`.
- Pushing or merging needs the owner's go-ahead at execution time.

## Review Focus

1. **The same money counted twice.**
   - Two goals that both track Ally Savings must not both count one $400 transfer.
   - Re-running crediting, re-importing, or editing a goal must not duplicate contributions.
   → Task 5 `a transfer counts toward one goal, by priority, once`.
2. **Starting amount vs. history.** A user who enters "already saved $2,500 as of Nov 7" must not also get transfers dated before Nov 7 added on top. → Task 5 `counts only what happens after the goal's start date`.
3. **A goal with no target, no plan, or no history.** It shows progress only, with a prompt, and never a made-up date or a "Behind" chip. → Task 3 `shows progress only without a target`, `doesn't project without a pace`.
4. **Reaching a goal that shares an account with the next one.**
   - Money keeps counting toward the reached goal, and the card asks "Mark it done?".
   - Once it's done, the next goal gets the money.
   → Task 5 `a reached goal keeps its money until it's marked done, then the next goal gets it`; Task 6 `prompts to roll over a reached goal`.
5. **Records that change underneath a goal.** If the import is undone, the transaction is hidden, or the user says "Doesn't count", progress drops, and automation never brings it back. → Task 5 `undo, hiding, and "doesn't count" all take money back out`.

---

## File Structure

```
src/lib/dates.ts (+test)                       (modify) addMonths
src/server/plan/engine.ts (+test)              (modify) buffer with a destination tracks moves
src/components/plan/{health-chip,bucket-card}.tsx (modify) copy carry-overs
src/server/db/finance-schema.ts                (modify) goals, goal_contributions
src/server/goals/
  projection.ts (+test)                        projectGoal (pure)
  goals-service.ts (+test)                     goal CRUD, order, status, manual contributions
  credit-service.ts (+test)                    creditGoals, regoal, linkTransactionToGoal, setContributionCounted
  overview.ts (+test)                          getGoalsOverview
  goals-fixtures.test.ts                       the owner's goals and other households'
src/server/import/service.ts, src/server/categorize/pipeline.ts, src/app/(app)/transactions/actions.ts   (modify) credit after import / sort / recategorize
src/app/(app)/goals/{page.tsx,actions.ts}      + src/components/goals/*
src/components/plan/bucket-card.tsx, src/components/transactions/transaction-sheet.tsx (modify) "Funds {goal}", "Counts toward"
e2e/goals.spec.ts; e2e/plan.spec.ts, e2e/shell.spec.ts, e2e/global-setup.ts, e2e/fixtures.ts (modify)
docs/setup.md, README.md (modify)
```

---

### Task 1: Plan carry-overs (Phase 2a-1 deferred items 3 and 6)

**Files:**
- Modify: `src/server/plan/engine.ts`, `engine.test.ts`, `src/components/plan/health-chip.tsx`, `src/components/plan/bucket-card.tsx`, `src/components/plan/plan-board.tsx`, `e2e/plan.spec.ts`

**Interfaces:**
- Produces behavior changes only:
  - **`bucketActivity`:** a `buffer` bucket **with** a destination counts transfer inflows into it (like savings and goal). Without a destination, it counts its tracked categories, as before. `status-service`'s shared-destination logic includes these buffers.
  - **`HealthChip`** takes `cadence` and reads "for a typical ≈ {amount} month" in monthly plans, "… income" otherwise.
  - **`BucketCard`:**
    - "Gets …" falls back to `draft.fundingCents` when typical funding is null;
    - a savings or goal bucket without a destination shows "Choose where it moves to in Edit plan" instead of "$0.00 of $X moved".

- [ ] **Step 1: Write the failing tests**

```ts
// engine.test.ts
it("a buffer with a destination tracks moves; without one it tracks spending", () => {
  const rows: ActivityRow[] = [
    { date: "2026-11-13", amountCents: 20_000, accountId: "buffer-acct", categoryId: null, isTransfer: true, recurringRuleId: null },
    { date: "2026-11-14", amountCents: -3_000, accountId: "chk", categoryId: "shopping", isTransfer: false, recurringRuleId: null },
  ];
  const w = { start: "2026-11-13", end: "2026-11-26" };
  expect(bucketActivity(b({ role: "buffer", destinationAccountId: "buffer-acct", trackCategoryIds: ["shopping"] }), rows, w)).toBe(20_000);
  expect(bucketActivity(b({ role: "buffer", trackCategoryIds: ["shopping"] }), rows, w)).toBe(3_000);
});
```

```ts
// e2e/plan.spec.ts — append to "starts from scratch with a monthly plan", after "Fully allocated":
await expect(page.getByText(/for a typical ≈ \$500\.00 month/)).toBeVisible();
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/plan/engine.test.ts && pnpm test:e2e e2e/plan.spec.ts`
Expected: the engine test FAILS (0 instead of 20000); the e2e FAILS (text says "income").

- [ ] **Step 3: Implement**, then run the same commands.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "fix: buffers with a destination track moves; plan copy carry-overs"
```

---

### Task 2: Schema, migration, and `addMonths`

**Files:**
- Modify: `src/server/db/finance-schema.ts`, `src/lib/dates.ts`, `src/lib/dates.test.ts`
- Create: migration `drizzle/0006_*.sql` (generated)

**Interfaces:**
- Produces:
  - **Types:**
    - `GoalType = "savings" | "debt_payoff" | "purchase" | "retirement"`;
    - `GoalStatus = "active" | "paused" | "completed" | "archived"`;
    - `ContributionSource = "manual" | "auto" | "linked"`;
    - `PlannedPer = "month" | "income"`.
  - **`goals`:**
    - `id, user_id, name, type, icon text not null`;
    - `target_cents bigint(number) null`, `target_date date null`, `starting_cents bigint(number) not null default 0`;
    - `priority int not null`;
    - `planned_cents bigint(number) null`, `planned_per text null`;
    - `status text not null default 'active'`;
    - `funded_by_bucket_id → buckets set null`;
    - `track_account_id → accounts set null`, `track_category_id → categories set null`;
    - `start_date date not null`;
    - `completed_at timestamp null`;
    - timestamps;
    - index `(user_id)`.
  - **`goal_contributions`:**
    - `id, user_id`, `goal_id → goals cascade`;
    - `date date not null`, `amount_cents bigint(number) not null`;
    - `transaction_id → transactions cascade` (nullable);
    - `source text not null`;
    - `excluded boolean not null default false`;
    - `note text null`;
    - `created_at`;
    - index `(goal_id)`;
    - **unique `(transaction_id)`**.
  - **`dates.ts`:** `addMonths(iso: string, n: number): string`, with the day clamped to the target month's length.

- [ ] **Step 1: Write the failing test**

```ts
it("adds months with the day clamped to the month", () => {
  expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  expect(addMonths("2026-11-30", 9)).toBe("2027-08-30");
  expect(addMonths("2027-02-28", -1)).toBe("2027-01-28");
  expect(addMonths("2026-12-15", 2)).toBe("2027-02-15");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/dates.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement; generate and apply the migration**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: `drizzle/0006_*.sql` contains only `CREATE TABLE`, `CREATE [UNIQUE] INDEX`, and FK constraints.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run && pnpm typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: goals and goal contributions tables; addMonths"
```

---

### Task 3: Projection (pure)

**Files:**
- Create: `src/server/goals/projection.ts`, `src/server/goals/projection.test.ts`

**Interfaces:**
- Consumes: `addMonths`, `addDays`, `daysBetween`.
- Produces:
  - `type ProjectionInput = { targetCents: number | null; targetDate: string | null; startingCents: number; contributions: { date: string; amountCents: number }[]; plannedMonthlyCents: number | null; completed: boolean; today: string }`
    - `contributions` are the counted ones only.
  - `type GoalChip = "done" | "ahead" | "on_track" | "behind"`
  - `type Projection = { progressCents: number; remainingCents: number | null; percent: number | null; reached: boolean; paceMonthlyCents: number | null; paceBasis: "actual" | "plan" | null; projectedDate: string | null; neededMonthlyCents: number | null; chip: GoalChip | null; horizon: "short" | "long" | null }`
  - `projectGoal(input: ProjectionInput): Projection`
    - Rules as in Global Constraints.
    - `percent` = progress ÷ target, clamped to [0, 1].
    - A pace of 0 counts as no pace.

- [ ] **Step 1: Write the failing tests** (today `2026-11-30`)

```ts
const base = { targetCents: null, targetDate: null, startingCents: 0, contributions: [], plannedMonthlyCents: null, completed: false, today: "2026-11-30" };
const c = (date: string, amountCents: number) => ({ date, amountCents });

it("projects from the plan until there's 3 months of history", () => {
  expect(projectGoal({ ...base, targetCents: 1_000_000, startingCents: 250_000, contributions: [c("2026-11-13", 40_000), c("2026-11-27", 40_000)], plannedMonthlyCents: 80_000 })).toEqual({
    progressCents: 330_000, remainingCents: 670_000, percent: 0.33, reached: false, paceMonthlyCents: 80_000, paceBasis: "plan",
    projectedDate: "2027-08-30", neededMonthlyCents: null, chip: "on_track", horizon: "short",
  });
});
it("says when a goal is behind its date, and what it needs", () => {
  expect(projectGoal({ ...base, targetCents: 200_000, targetDate: "2027-02-28", startingCents: 50_000, plannedMonthlyCents: 20_000 })).toMatchObject({
    remainingCents: 150_000, projectedDate: "2027-07-30", neededMonthlyCents: 50_000, chip: "behind", horizon: "short",
  });
});
it("uses the recent pace once there's history, and can be ahead", () => {
  const contributions = ["2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15", "2026-11-15"].map((d) => c(d, 10_000));
  expect(projectGoal({ ...base, targetCents: 100_000, targetDate: "2027-06-30", contributions, plannedMonthlyCents: 50_000 })).toMatchObject({
    progressCents: 50_000, paceMonthlyCents: 10_000, paceBasis: "actual", projectedDate: "2027-04-30", chip: "ahead",
  });
});
it("is on track when the plan lands right on the date", () => {
  expect(projectGoal({ ...base, targetCents: 1_200_000, targetDate: "2028-11-30", plannedMonthlyCents: 50_000 })).toMatchObject({
    projectedDate: "2028-11-30", neededMonthlyCents: 50_000, chip: "on_track", horizon: "long",
  });
});
it("shows progress only without a target", () => {
  expect(projectGoal({ ...base, contributions: [c("2026-11-20", 10_000)], plannedMonthlyCents: 5_000 })).toMatchObject({
    progressCents: 10_000, remainingCents: null, percent: null, projectedDate: null, chip: null,
  });
});
it("doesn't project without a pace", () => {
  expect(projectGoal({ ...base, targetCents: 100_000 })).toMatchObject({ paceMonthlyCents: null, projectedDate: null, chip: null, horizon: null });
  expect(projectGoal({ ...base, targetCents: 100_000, targetDate: "2027-06-30" })).toMatchObject({ projectedDate: null, chip: "behind" });
});
it("is done when reached or completed, and needs everything now past its date", () => {
  expect(projectGoal({ ...base, targetCents: 100_000, startingCents: 120_000 })).toMatchObject({ reached: true, chip: "done", percent: 1, projectedDate: null, remainingCents: 0 });
  expect(projectGoal({ ...base, targetCents: 100_000, completed: true }).chip).toBe("done");
  expect(projectGoal({ ...base, targetCents: 100_000, targetDate: "2026-10-31", plannedMonthlyCents: 10_000 })).toMatchObject({ neededMonthlyCents: 100_000, chip: "behind" });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/goals/projection.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**, then run the same command.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: goal projections from your recent pace or your plan"
```

---

### Task 4: Goals service

**Files:**
- Create: `src/server/goals/goals-service.ts`, `goals-service.test.ts`

**Interfaces:**
- Consumes: Task 2 tables; `logActivity`; `getSettings`; `todayInTimeZone`.
- Produces:
  - `type Goal = typeof goals.$inferSelect`, `type GoalContribution = typeof goalContributions.$inferSelect`
  - `goalInputSchema` (Zod) and `type GoalInput = { name: string; type: GoalType; icon?: string; targetCents: number | null; targetDate: string | null; startingCents: number; startDate?: string; plannedCents: number | null; plannedPer: PlannedPer | null; fundedByBucketId: string | null; trackAccountId: string | null; trackCategoryId: string | null }`
    - Default `icon` by type: savings `piggy-bank`, debt_payoff `landmark`, purchase `shopping-bag`, retirement `sunset`.
    - Default `startDate` = the tracking start date, else today in the user's timezone.
  - **CRUD:**
    - `listGoals(db, userId): Promise<Goal[]>` (by priority, then created);
    - `createGoal(db, userId, input): Promise<Goal>` (priority = max + 1);
    - `updateGoal(db, userId, id, input): Promise<Goal>`;
    - `deleteGoal(db, userId, id): Promise<void>`;
    - `moveGoal(db, userId, id, direction: "up" | "down"): Promise<void>` (swaps priority with its neighbor; a no-op at the ends);
    - `setGoalStatus(db, userId, id, status: GoalStatus): Promise<Goal>` (`completed` sets `completed_at`; any other status clears it).
  - **Contributions:**
    - `addContribution(db, userId, goalId, input: { date: string; amountCents: number; note?: string }): Promise<GoalContribution>` (source `manual`; negative amounts are withdrawals);
    - `listContributions(db, userId, goalId, limit = 20): Promise<(GoalContribution & { counted: boolean })[]>`, where `counted` = not excluded and its transaction (if any) is not hidden.
- **Validation** (`ValidationError`, with exactly these messages):
  - `"Give it a name"`;
  - `"Enter a target above $0"`;
  - `"Enter a planned amount above $0"` (planned without a positive amount or without `plannedPer`);
  - `"Choose one way to count it automatically"` (both `trackAccountId` and `trackCategoryId`);
  - `"Enter what's already saved as $0 or more"`;
  - `"Enter an amount"` (contribution 0);
  - `"Enter a valid date"`;
  - `NotFoundError` for another user's goal, bucket, account, or category.
- **Activity:**
  - `goal.create`, `goal.update`, `goal.delete`, `goal.move`, `goal.status`;
  - `goal_contribution.create`.
- Create, update, status, and move call `regoal` (Task 5) once it exists. **Task 4 leaves a no-op hook:** `afterGoalChange(db, userId, goalId)` in `goals-service.ts`, which Task 5 fills.

- [ ] **Step 1: Write the failing tests**

```ts
it("creates, lists in priority order, moves, and deletes goals", async () => {
  /* createGoal "Emergency fund" (savings, target 1000000), "Roth IRA" (retirement, target 700000) → listGoals names in that order,
     priorities [1, 2], icons ["piggy-bank", "sunset"], startDate = the tracking start date ("2026-11-07");
     moveGoal(Roth, "up") → ["Roth IRA", "Emergency fund"]; moveGoal(Roth, "up") again → unchanged; deleteGoal(Emergency) → ["Roth IRA"];
     activity has goal.create ×2, goal.move, goal.delete. */
});
it("validates goals and contributions", async () => {
  /* name " " → "Give it a name"; targetCents 0 → "Enter a target above $0"; plannedCents 100 with plannedPer null →
     "Enter a planned amount above $0"; both trackAccountId and trackCategoryId → "Choose one way to count it automatically";
     startingCents -1 → "Enter what's already saved as $0 or more"; addContribution amount 0 → "Enter an amount";
     a goal with no target, no plan, no tracking is valid. */
});
it("marks goals done and back", async () => {
  /* setGoalStatus(completed) → status "completed", completedAt set; setGoalStatus(active) → completedAt null. */
});
it("adds money by hand, including withdrawals", async () => {
  /* addContribution(+10000, 2026-11-20, "birthday money"), addContribution(-2500) → listContributions newest first,
     both counted, sources "manual". */
});
it("isolates users", async () => {
  /* B can't update, delete, move, or add to A's goal (NotFoundError); A can't track B's account/category or fund from B's bucket. */
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/goals/goals-service.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**, then run `pnpm vitest run src/server/goals && pnpm typecheck`.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: goals service (create, order, status, money added by hand)"
```

---

### Task 5: Crediting goals automatically, and by link

**Files:**
- Create: `src/server/goals/credit-service.ts`, `credit-service.test.ts`
- Modify:
  - `src/server/goals/goals-service.ts` (`afterGoalChange` → `regoal`);
  - `src/server/import/service.ts` (credit after matching);
  - `src/server/categorize/pipeline.ts` (`sortTransactions` credits);
  - `src/app/(app)/transactions/actions.ts` (credit after `setCategory` / `bulkCategorize`).

**Interfaces:**
- Produces:
  - **`creditGoals(db: Database, userId: string): Promise<number>`**
    - **Candidates:** non-hidden transactions with no contribution row, dated on or after the earliest active goal's `start_date`.
    - **Fits:**
      - `track_account_id`: the transaction is in that account, is transfer-paired (pair id set and not `"none"`), and has amount > 0. The contribution is that amount.
      - `track_category_id`: the transaction has that category and amount < 0. The contribution is `−amount`.
    - **Eligible goals:** `status = 'active'` and `start_date ≤ date`.
    - **Winner:** the lowest `priority`.
    - **Write:** insert `source: "auto"` with `ON CONFLICT (transaction_id) DO NOTHING`, and log `goal_contribution.auto`.
    - Returns the number inserted.
  - **`regoal(db, userId, goalId): Promise<number>`**: deletes the goal's `auto` contributions that aren't excluded (excluded ones stay, to block re-credit), then `creditGoals`.
  - **`linkTransactionToGoal(db, userId, transactionId: string, goalId: string | null): Promise<void>`**
    - **With a goal:** removes any existing contribution for the transaction, then inserts `source: "linked"` with amount `abs(transaction amount)` and the transaction's date.
    - **With `null`:** marks the transaction's existing contribution `excluded`, or inserts an excluded `linked` row with amount 0 when there is none, so automation never counts it.
    - Activity `goal_contribution.link`.
  - **`setContributionCounted(db, userId, contributionId: string, counted: boolean): Promise<void>`**: manual rows are deleted when `counted = false`; auto and linked rows toggle `excluded`.
  - **Wiring:**
    - `commitImport` runs `creditGoals` after `matchRecurring`, in its own try/catch.
    - `sortTransactions` returns `credited`.
    - The transactions actions `setCategory` and `bulkCategorize` call `creditGoals` after success.

- [ ] **Step 1: Write the failing tests** (start 2026-11-07; checking, Ally Savings; `pair(date, cents)` inserts a checking −cents / Ally Savings +cents pair)

```ts
it("credits moves into a goal's account and spending in its category", async () => {
  /* Emergency fund (track Ally Savings), Roth IRA (track category Investing). pair 2026-11-13 40000; a checking row -50000 on 2026-11-20
     with category Investing → creditGoals returns 2; Emergency contributions [40000 auto], Roth [50000 auto]; a second creditGoals returns 0. */
});
it("a transfer counts toward one goal, by priority, once", async () => {
  /* Emergency (priority 1) and Vacation (priority 2) both track Ally Savings; pair 2026-11-13 40000 → only Emergency gets it;
     updateGoal(Vacation) and regoal(Emergency) leave exactly one contribution for that transaction. */
});
it("counts only what happens after the goal's start date", async () => {
  /* Emergency startDate 2026-11-20; pairs on 2026-11-13 and 2026-11-27 → only the 11-27 transfer counts. */
});
it("a reached goal keeps its money until it's marked done, then the next goal gets it", async () => {
  /* Emergency target 50000, starting 40000; Vacation tracks the same account. pair 11-13 40000 → Emergency (reached).
     pair 11-20 40000 → still Emergency. setGoalStatus(Emergency, completed); pair 11-27 40000 → Vacation. */
});
it("undo, hiding, and \"doesn't count\" all take money back out", async () => {
  /* Imported transfer credited; setHidden(row) → listContributions shows counted false; unhide → counted again.
     setContributionCounted(contribution, false) → counted false, and creditGoals doesn't re-credit it.
     linkTransactionToGoal(otherRow, null) → never auto-credited. For an import batch: undoImport → its contributions are gone (FK cascade). */
});
it("links any transaction to a goal by hand", async () => {
  /* a checking row -12000 "Venmo to Sam" → linkTransactionToGoal(row, Vacation) → Vacation has 12000 "linked";
     linking it to Emergency instead moves it. */
});
it("the import credits goals", async () => {
  /* Emergency tracks the UFCU savings account; import ufcu-checking then ufcu-savings (transfer pairs detected) → the savings side of the
     2026-11-12 transfer is credited to Emergency. */
});
it("isolates users", async () => { /* B's creditGoals never credits A's goals or transactions; B can't link A's transaction or goal. */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/goals`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement and wire**, then run `pnpm vitest run && pnpm typecheck`.
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: goals credit themselves from real transfers and spending, by priority"
```

---

### Task 6: Goals overview, and fixtures

**Files:**
- Create: `src/server/goals/overview.ts`, `overview.test.ts`, `goals-fixtures.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5; `getPlanStatus` (`incomesPerMonth` and bucket `monthlyCents`); account and category names.
- Produces:
  - **`type GoalView`** = the `Goal` fields, plus:
    - `projection: Projection`;
    - `plannedMonthlyCents: number | null`, `plannedBasis: "set" | "bucket" | null`;
    - `trackLabel: string | null` ("Moves into Ally Savings" / "Spending in Investing");
    - `fundedByBucketName: string | null`;
    - `recent: (GoalContribution & { counted: boolean })[]` (the latest 10);
    - `rollOverTo: string | null`: the name of the next active goal, by priority, with the same tracking source. Set only when this goal is reached and still `active`.
  - **`type GoalsOverview = { today: string; goals: GoalView[]; archived: GoalView[]; totalSavedCents: number }`**
    - `totalSavedCents` sums the progress of active and completed goals.
  - **`getGoalsOverview(db, userId, now?: Date): Promise<GoalsOverview>`**
    - `projectGoal` receives only counted contributions, with `completed = status === "completed"`.
    - Paused goals are listed with their projection but no chip (chip null).

- [ ] **Step 1: Write the failing tests**

```ts
// overview.test.ts
it("projects each goal and labels where its money comes from", async () => { /* manual + auto contributions → GoalView.projection.progressCents correct; trackLabel "Moves into Ally Savings". */ });
it("prompts to roll over a reached goal", async () => { /* Emergency reached and active, Vacation tracks the same account → Emergency.rollOverTo "Vacation"; after setGoalStatus completed → null. */ });
it("plans from a funding bucket when no amount is set", async () => {
  /* paycheck plan (Savings 40000 per income, biweekly) and Emergency fundedByBucket Savings, planned null → plannedMonthlyCents 80000, plannedBasis "bucket";
     with plannedCents 30000 per "income" → 60000, basis "set". */
});
it("isolates users", async () => { /* B's overview is empty. */ });
```

```ts
// goals-fixtures.test.ts
it("the owner: emergency fund first, then Roth IRA", async () => {
  /* Owner setup (paycheck plan with Savings & investing → Ally Savings 40000 per income). Emergency fund: target 1000000, starting 250000,
     fundedBy Savings & investing, track Ally Savings, start 2026-11-07. Roth IRA: retirement, target 700000, track category Investing.
     Pairs into Ally Savings 40000 on 11-13 and 11-27; checking -50000 on 11-20 categorized Investing; creditGoals.
     now 2026-11-30T18:00Z → Emergency progress 330000, plannedMonthlyCents 80000 (bucket), projection.projectedDate "2027-08-30", chip "on_track";
     Roth progress 50000, projectedDate null, chip null; totalSavedCents 380000. */
});
it("another household: paying off a car on a deadline", async () => {
  /* debt_payoff "Car loan" target 1200000, targetDate 2028-11-30, planned 50000/month, manual contributions none →
     chip "on_track", neededMonthlyCents 50000, horizon "long". */
});
it("another household: saving for a laptop, behind schedule", async () => {
  /* purchase "Laptop" target 200000, targetDate 2027-02-28, starting 50000, planned 20000/month → chip "behind", neededMonthlyCents 50000. */
});
it("another household: a freelancer's tax pot from every payout", async () => {
  /* savings goal "Taxes" with no target, track account "Tax savings"; pairs into Tax savings 7500, 11250, 6250 → progress 25000, chip null,
     remainingCents null. */
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/goals`
Expected: the new files FAIL.

- [ ] **Step 3: Implement `overview.ts`**, then run `pnpm vitest run && pnpm typecheck`.
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: goals overview with projections, funding, and roll-over prompts; owner and other-household fixtures"
```

---

### Task 7: Goals page

**Files:**
- Modify: `src/app/(app)/goals/page.tsx` (replace the placeholder), `e2e/shell.spec.ts` (drop the `/goals` placeholder row), `e2e/global-setup.ts`, `e2e/fixtures.ts`
- Create:
  - `src/app/(app)/goals/actions.ts`;
  - `src/components/goals/{goals-board.tsx,goal-card.tsx,goal-dialog.tsx,contribution-dialog.tsx}`;
  - `e2e/goals.spec.ts`.

**Interfaces:**
- Consumes: `getGoalsOverview`, the goals-service and credit-service functions, `billBucketOptions` (buckets for "Funded by"), `listAccounts`, `listCategories`.
- Produces:
  - **Server Actions** (Zod-validated; each revalidates `/goals` and `/plan`):
    - `saveGoalAction(input, id?)`;
    - `deleteGoalAction(id)`;
    - `moveGoalAction(id, direction)`;
    - `setGoalStatusAction(id, status)`;
    - `addContributionAction(goalId, input)`;
    - `setContributionCountedAction(id, counted)`.
- **The page:**
  - `PageHeader` "Goals", "What you're saving toward, in order." Then "Add goal".
  - Total line: "≈ {totalSaved} saved across your goals".
  - Without goals: the empty state "Add your first goal — an emergency fund, a trip, paying off a card. Finnance tracks it from the money you move."
- **`GoalCard`** (a list item with a heading = name):
  - **Top:** icon, name, type label (Savings / Debt payoff / Purchase / Retirement), and the chip.
  - **Big number:** "{progress} of {target}", or "{progress} saved" plus a "Set a target" button when there's no target.
  - **Progress bar.**
  - **Projection line:**
    - plan pace: "At ≈ {pace}/mo (your plan), done by {Month YYYY}";
    - actual pace: "At your recent pace of ≈ {pace}/mo, done by {Month YYYY}";
    - no pace: "Add a planned amount to see when you'll get there";
    - with a target date: "Needs ≈ {needed}/mo to finish by {date}";
    - if `trackLabel`, the small line "Counts {trackLabel lowercased}".
  - **Roll-over banner** when `rollOverTo`: "Reached! Mark it done so what comes next goes to {rollOverTo}" with the button "Mark done".
  - **Buttons:** "Add money", "Edit", and "Move {name} up" / "Move {name} down" (icon buttons).
- **`GoalDialog`** fields:
  - Name; Type; "Target" (optional); "Target date" (optional);
  - "Already saved" plus "as of" (date, default `startDate`);
  - "Plan to add" (amount) plus a per-select ("per month" / "from each income");
  - "Funded by" (plan buckets, "None");
  - "Counts automatically" (None / "Moves into {account}" for each account / "Spending in {category}" for each category).
  - Choosing a "Funded by" bucket with a destination pre-selects "Moves into {destination}".
  - Edit adds Status (Active / Paused / Archived) and Delete (AlertDialog "Delete {name}? Its history goes with it.").
- **`ContributionDialog`:**
  - fields "Amount" (negative for a withdrawal), "Date" (default today), "Note";
  - below, "Recent", with each contribution's date, amount, and source ("by hand" / "automatically" / "linked"), plus a "Doesn't count" / "Count it" toggle for auto and linked rows, or "Remove" for manual ones.
- **e2e:**
  - `GOALS_USER` is seeded with CHECKING and an "Ally Savings" account.
  - Test `adds a goal and money by hand` (desktop only): Add goal → Name "Emergency fund", Target "10000", Already saved "2500", Plan to add "800" per month → Save → the card shows "$2,500.00 of $10,000.00" and text matching /your plan/ → Add money → Amount "100" → Save → the card shows "$2,600.00 of $10,000.00".
  - Test `orders goals` (desktop only): add "First" and "Second" (no target) → "Move Second up" → the first goal heading in the list is "Second".

- [ ] **Step 1: Read the Next docs** for forms (`node_modules/next/dist/docs/01-app/02-guides/forms.md`).
- [ ] **Step 2: Write the failing e2e** and the seed.

Run: `pnpm test:e2e e2e/goals.spec.ts`
Expected: FAIL (placeholder page).

- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test:e2e e2e/goals.spec.ts e2e/shell.spec.ts`
Expected: PASS.

- [ ] **Step 5: Phone check:** a screenshot at 390×844 of `/goals` with two goals. Fix anything cramped; the progress number is the biggest thing on the card.
- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Goals page with progress, projections, priority order, and money added by hand"
```

---

### Task 8: Goals on the Plan page and on transactions

**Files:**
- Modify:
  - `src/server/plan/status-service.ts` (`BucketView.fundsGoals: string[]`);
  - `src/components/plan/bucket-card.tsx`;
  - `src/app/(app)/transactions/{page.tsx,actions.ts}`;
  - `src/components/transactions/{transaction-list,transaction-sheet}.tsx`;
  - `src/server/finance/transactions.ts` (`TransactionRow.goal: { id: string; name: string; counted: boolean } | null`);
  - `src/server/plan/status-service.test.ts`, `src/server/finance/transactions.test.ts`, `e2e/goals.spec.ts`.

**Interfaces:**
- Produces:
  - **Plan page:** `BucketView.fundsGoals` (the names of active goals with `funded_by_bucket_id` = the bucket). `BucketCard` adds "Funds {names joined with ', '}".
  - **`TransactionRow.goal`:** from a left join to `goal_contributions` and `goals`; null without a contribution.
  - **Server Action `linkGoalAction(transactionId, goalId | null)`**: `linkTransactionToGoal`, then returns the refreshed row.
  - **Sheet:** a "Goal" block with the select "Counts toward" (active goals plus "No goal"). It shows the current goal when counted, and "Doesn't count" when excluded.
- **e2e** (append to `e2e/goals.spec.ts`), `counts a transaction toward a goal` (`GOALS_LINK_USER`, seeded with CHECKING and one goal "Gift fund"): Transactions → open "Bennu Coffee" → Counts toward "Gift fund" → Goals → the "Gift fund" card shows "$6.25 saved".

- [ ] **Step 1: Write the failing tests**

```ts
// status-service.test.ts
it("shows which goals a bucket funds", async () => { /* createGoal "Emergency fund" fundedBy Savings & investing → that BucketView.fundsGoals = ["Emergency fund"]. */ });
// transactions.test.ts
it("shows the goal a transaction counts toward", async () => { /* linkTransactionToGoal(row, goal) → listTransactions row.goal ⊇ { name: goal.name, counted: true }. */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/server/plan/status-service.test.ts src/server/finance/transactions.test.ts && pnpm test:e2e e2e/goals.spec.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**, then run `pnpm typecheck && pnpm lint && pnpm vitest run && pnpm test:e2e e2e/goals.spec.ts e2e/plan.spec.ts e2e/transactions.spec.ts`.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: buckets show the goals they fund; any transaction can count toward a goal"
```

---

### Task 9: Ship and owner acceptance

**Files:**
- Modify: `docs/setup.md` (new section "14. Add your goals"), `README.md` (status: Phase 2a-2)

- [ ] **Step 1: Write the owner's steps** in `docs/setup.md`:
1. Open **Goals → Add goal**.
2. For your emergency fund, enter the target (or leave it blank for now), what's **already saved** and as of which date, and choose **Funded by: Savings & investing**. That makes it count **moves into Ally Savings** automatically.
3. Add your Roth IRA next, with **Counts automatically: Spending in Investing** (or add money by hand when you contribute).
4. Goals are in priority order; use the arrows to change it. When a goal is reached, its card asks to **Mark done**, and what you move next counts toward the following goal.

✅ Each goal shows its progress and when you'll get there, "based on your plan" until 3 months of real contributions exist.

- [ ] **Step 2: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build`
Expected: all pass, including `goals-fixtures.test.ts`.

- [ ] **Step 3: Owner checkpoint.** Ask for the go-ahead to merge to `main` and push. This deploys, and the build runs migration `0006`.

After deploy, run: `curl -s -o /dev/null -w "%{http_code}" https://finnance-tau.vercel.app/goals`
Expected: `307`.

- [ ] **Step 4: Owner acceptance.** The owner adds the emergency fund and Roth IRA:
- after the next import, the Ally Savings moves count toward the emergency fund;
- the projected date looks sensible.

After acceptance, delete this plan's `.superpowers/sdd/` workspace.
