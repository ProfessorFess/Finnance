import { afterEach, beforeEach, expect, it } from "vitest";
import { type Account, createAccount } from "@/server/finance/accounts";
import { setTrackingStartDate } from "@/server/finance/settings";
import { getActivePlan } from "@/server/plan/plans-service";
import { createTestDb } from "@/test/db";
import { createTestUser } from "@/test/users";
import { creditGoals } from "./credit-service";
import { addContribution, createGoal, type GoalInput, setGoalStatus } from "./goals-service";
import { getGoalsOverview } from "./overview";
import { ownerPlan, transferPair } from "./test-helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let checking: Account;
let allySav: Account;
const now = new Date("2026-11-30T18:00:00Z");

const goal = (over: Partial<GoalInput> = {}): GoalInput => ({
  name: "Emergency fund", type: "savings", targetCents: 1_000_000, targetDate: null, startingCents: 0, plannedCents: null, plannedPer: null,
  fundedByBucketId: null, trackAccountId: null, trackCategoryId: null, ...over,
});

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-07");
  checking = await createAccount(t.db, A, { name: "UFCU Checking", type: "checking", startingBalanceCents: 0 });
  allySav = await createAccount(t.db, A, { name: "Ally Savings", type: "savings", startingBalanceCents: 0 });
});
afterEach(async () => {
  await t.close();
});

it("projects each goal and labels where its money comes from", async () => {
  const g = await createGoal(t.db, A, goal({ trackAccountId: allySav.id, startingCents: 100_000 }));
  await transferPair(t.db, A, checking.id, allySav.id, "2026-11-13", 40_000);
  await creditGoals(t.db, A);
  await addContribution(t.db, A, g.id, { date: "2026-11-20", amountCents: 5_000 });
  const [view] = (await getGoalsOverview(t.db, A, now)).goals;
  expect(view).toMatchObject({ name: "Emergency fund", trackLabel: "Moves into Ally Savings", projection: { progressCents: 145_000 } });
  expect(view!.recent.map((c) => c.amountCents)).toEqual([5_000, 40_000]);
});

it("prompts to roll over a reached goal", async () => {
  const emergency = await createGoal(t.db, A, goal({ targetCents: 50_000, startingCents: 40_000, trackAccountId: allySav.id }));
  await createGoal(t.db, A, goal({ name: "Vacation", trackAccountId: allySav.id }));
  await transferPair(t.db, A, checking.id, allySav.id, "2026-11-13", 40_000);
  await creditGoals(t.db, A);
  expect((await getGoalsOverview(t.db, A, now)).goals[0]!.rollOverTo).toBe("Vacation");
  await setGoalStatus(t.db, A, emergency.id, "completed");
  expect((await getGoalsOverview(t.db, A, now)).goals.find((g) => g.name === "Emergency fund")!.rollOverTo).toBeNull();
});

it("plans from a funding bucket when no amount is set", async () => {
  await ownerPlan(t.db, A, checking.id, allySav.id);
  const savingsBucket = (await getActivePlan(t.db, A))!.buckets[0]!;
  await createGoal(t.db, A, goal({ fundedByBucketId: savingsBucket.id }));
  await createGoal(t.db, A, goal({ name: "Per paycheck", plannedCents: 30_000, plannedPer: "income" }));
  const views = (await getGoalsOverview(t.db, A, now)).goals;
  expect(views[0]).toMatchObject({ plannedMonthlyCents: 80_000, plannedBasis: "bucket", fundedByBucketName: "Savings & investing" });
  expect(views[1]).toMatchObject({ plannedMonthlyCents: 60_000, plannedBasis: "set" });
});

it("isolates users", async () => {
  await createGoal(t.db, A, goal());
  expect((await getGoalsOverview(t.db, B, now)).goals).toEqual([]);
});
