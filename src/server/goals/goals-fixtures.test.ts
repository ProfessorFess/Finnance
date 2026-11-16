// The owner's goals and other households' (spec 1, 9): the numbers are the contract.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { transactions } from "@/server/db/schema";
import { createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { setTrackingStartDate } from "@/server/finance/settings";
import { getActivePlan } from "@/server/plan/plans-service";
import { createTestDb } from "@/test/db";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { creditGoals } from "./credit-service";
import { createGoal, type GoalInput } from "./goals-service";
import { getGoalsOverview } from "./overview";
import { ownerPlan, transferPair } from "./test-helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
const now = new Date("2026-11-30T18:00:00Z");
const goal = (over: Partial<GoalInput> & Pick<GoalInput, "name" | "type">): GoalInput => ({
  targetCents: null, targetDate: null, startingCents: 0, plannedCents: null, plannedPer: null, fundedByBucketId: null, trackAccountId: null, trackCategoryId: null, ...over,
});

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-07");
});
afterEach(async () => {
  await t.close();
});

it("the owner: emergency fund first, then Roth IRA", async () => {
  const checking = await createAccount(t.db, A, { name: "UFCU Checking", type: "checking", startingBalanceCents: 0 });
  const allySav = await createAccount(t.db, A, { name: "Ally Savings", type: "savings", startingBalanceCents: 0 });
  await ownerPlan(t.db, A, checking.id, allySav.id);
  const savingsBucket = (await getActivePlan(t.db, A))!.buckets[0]!;
  const investing = (await listCategories(t.db, A)).find((c) => c.name === "Investing")!;
  await createGoal(t.db, A, goal({ name: "Emergency fund", type: "savings", targetCents: 1_000_000, startingCents: 250_000, fundedByBucketId: savingsBucket.id, trackAccountId: allySav.id, startDate: "2026-11-07" }));
  await createGoal(t.db, A, goal({ name: "Roth IRA", type: "retirement", targetCents: 700_000, trackCategoryId: investing.id }));
  await transferPair(t.db, A, checking.id, allySav.id, "2026-11-13", 40_000);
  await transferPair(t.db, A, checking.id, allySav.id, "2026-11-27", 40_000);
  const ira = await insertTestTransaction(t.db, A, checking.id, { amountCents: -50_000, date: "2026-11-20", description: "Brokerage" });
  await t.db.update(transactions).set({ categoryId: investing.id }).where(eq(transactions.id, ira.id));
  await creditGoals(t.db, A);

  const o = await getGoalsOverview(t.db, A, now);
  const [emergency, roth] = o.goals;
  expect(emergency).toMatchObject({ plannedMonthlyCents: 80_000, plannedBasis: "bucket", projection: { progressCents: 330_000, projectedDate: "2027-08-30", chip: "on_track", paceBasis: "plan" } });
  expect(roth).toMatchObject({ projection: { progressCents: 50_000, projectedDate: null, chip: null } });
  expect(o.totalSavedCents).toBe(380_000);
});

it("another household: paying off a car on a deadline", async () => {
  await createGoal(t.db, A, goal({ name: "Car loan", type: "debt_payoff", targetCents: 1_200_000, targetDate: "2028-11-30", plannedCents: 50_000, plannedPer: "month" }));
  const [car] = (await getGoalsOverview(t.db, A, now)).goals;
  expect(car!.projection).toMatchObject({ chip: "on_track", neededMonthlyCents: 50_000, horizon: "long" });
});

it("another household: saving for a laptop, behind schedule", async () => {
  await createGoal(t.db, A, goal({ name: "Laptop", type: "purchase", targetCents: 200_000, targetDate: "2027-02-28", startingCents: 50_000, plannedCents: 20_000, plannedPer: "month" }));
  const [laptop] = (await getGoalsOverview(t.db, A, now)).goals;
  expect(laptop!.projection).toMatchObject({ chip: "behind", neededMonthlyCents: 50_000 });
});

it("another household: a freelancer's tax pot from every payout", async () => {
  const checking = await createAccount(t.db, A, { name: "Checking", type: "checking", startingBalanceCents: 0 });
  const tax = await createAccount(t.db, A, { name: "Tax savings", type: "savings", startingBalanceCents: 0 });
  await createGoal(t.db, A, goal({ name: "Taxes", type: "savings", trackAccountId: tax.id }));
  for (const [date, cents] of [["2026-11-03", 7_500], ["2026-11-10", 11_250], ["2026-11-17", 6_250]] as const) {
    await transferPair(t.db, A, checking.id, tax.id, date === "2026-11-03" ? "2026-11-08" : date, cents);
  }
  await creditGoals(t.db, A);
  const [taxes] = (await getGoalsOverview(t.db, A, now)).goals;
  expect(taxes!.projection).toMatchObject({ progressCents: 25_000, chip: null, remainingCents: null });
});
