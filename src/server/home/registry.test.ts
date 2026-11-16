import { afterEach, beforeEach, expect, it } from "vitest";
import { type Account, createAccount } from "@/server/finance/accounts";
import { setTrackingStartDate } from "@/server/finance/settings";
import { createGoal, type GoalInput } from "@/server/goals/goals-service";
import { ownerPlan } from "@/server/goals/test-helpers";
import { createTestDb } from "@/test/db";
import { createTestUser } from "@/test/users";
import { loadWidget } from "./registry";
import { monthlyPlan } from "./test-helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let checking: Account;
let savings: Account;
const now = new Date("2026-11-20T18:00:00Z");
const goal = (name: string): GoalInput => ({
  name, type: "savings", targetCents: 1_000_000, targetDate: null, startingCents: 0, plannedCents: null, plannedPer: null,
  fundedByBucketId: null, trackAccountId: null, trackCategoryId: null,
});

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-07");
  checking = await createAccount(t.db, A, { name: "Checking", type: "checking", startingBalanceCents: 0 });
  savings = await createAccount(t.db, A, { name: "Ally Savings", type: "savings", startingBalanceCents: 0 });
});
afterEach(async () => {
  await t.close();
});

it("widgets survive deleted buckets and goals", async () => {
  await ownerPlan(t.db, A, checking.id, savings.id);
  for (const n of ["Emergency fund", "Roth IRA", "Vacation"]) await createGoal(t.db, A, goal(n));
  const bucket = await loadWidget(t.db, A, { type: "bucket_status", config: { bucketId: "gone" } }, now);
  expect(bucket).toMatchObject({ type: "bucket_status", data: { name: "Weekly spending" } });
  const goals = await loadWidget(t.db, A, { type: "goals", config: { goalId: "gone", limit: 2 } }, now);
  expect((goals!.data as { name: string }[]).map((g) => g.name)).toEqual(["Emergency fund", "Roth IRA"]);
  expect(await loadWidget(t.db, A, { type: "nope", config: {} }, now)).toBeNull();
  const upcoming = await loadWidget(t.db, A, { type: "upcoming", config: { days: "x" } }, now);
  expect(upcoming).toMatchObject({ type: "upcoming", data: expect.any(Array) });
});

it("a bucket widget picks a bucket that has a limit", async () => {
  await monthlyPlan(t.db, A, checking.id);
  expect(await loadWidget(t.db, A, { type: "bucket_status", config: {} }, now)).toMatchObject({ data: { name: "Groceries" } });
});

it("a bucket widget with no limits anywhere has nothing to show", async () => {
  await monthlyPlan(t.db, A, checking.id, { limits: false });
  expect(await loadWidget(t.db, A, { type: "bucket_status", config: {} }, now)).toMatchObject({ data: null });
});

it("every widget loads for a brand-new user", async () => {
  const fresh = (await createTestUser(t.db)).id;
  for (const type of ["setup", "bucket_status", "paycheck_tasks", "plan_overview", "goals", "upcoming", "spending_by_category", "needs_attention", "recent_transactions"])
    expect(await loadWidget(t.db, fresh, { type, config: {} }, now)).toMatchObject({ type });
});
