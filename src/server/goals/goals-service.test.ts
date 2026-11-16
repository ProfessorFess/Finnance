import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { activityLog } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { NotFoundError } from "@/server/finance/errors";
import { setTrackingStartDate } from "@/server/finance/settings";
import { createTestDb } from "@/test/db";
import { createTestUser } from "@/test/users";
import {
  addContribution,
  createGoal,
  deleteGoal,
  type GoalInput,
  listContributions,
  listGoals,
  moveGoal,
  setGoalStatus,
  updateGoal,
} from "./goals-service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let savings: Account;

const goal = (over: Partial<GoalInput> = {}): GoalInput => ({
  name: "Emergency fund",
  type: "savings",
  targetCents: 1_000_000,
  targetDate: null,
  startingCents: 0,
  plannedCents: null,
  plannedPer: null,
  fundedByBucketId: null,
  trackAccountId: null,
  trackCategoryId: null,
  ...over,
});
const actions = async () =>
  (await t.db.select().from(activityLog).where(and(eq(activityLog.userId, A), eq(activityLog.entityType, "goal")))).map((a) => a.action);

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-07");
  savings = await createAccount(t.db, A, { name: "Ally Savings", type: "savings", startingBalanceCents: 0 });
});
afterEach(async () => {
  await t.close();
});

it("creates, lists in priority order, moves, and deletes goals", async () => {
  const emergency = await createGoal(t.db, A, goal());
  const roth = await createGoal(t.db, A, goal({ name: "Roth IRA", type: "retirement", targetCents: 700_000 }));
  const list = await listGoals(t.db, A);
  expect(list.map((g) => [g.name, g.priority, g.icon, g.startDate])).toEqual([
    ["Emergency fund", 1, "piggy-bank", "2026-11-07"],
    ["Roth IRA", 2, "sunset", "2026-11-07"],
  ]);
  await moveGoal(t.db, A, roth.id, "up");
  expect((await listGoals(t.db, A)).map((g) => g.name)).toEqual(["Roth IRA", "Emergency fund"]);
  await moveGoal(t.db, A, roth.id, "up");
  expect((await listGoals(t.db, A)).map((g) => g.name)).toEqual(["Roth IRA", "Emergency fund"]);
  await deleteGoal(t.db, A, emergency.id);
  expect((await listGoals(t.db, A)).map((g) => g.name)).toEqual(["Roth IRA"]);
  expect(await actions()).toEqual(expect.arrayContaining(["goal.create", "goal.create", "goal.move", "goal.delete"]));
});

it("validates goals and contributions", async () => {
  const [investing] = (await listCategories(t.db, A)).filter((c) => c.name === "Investing");
  await expect(createGoal(t.db, A, goal({ name: " " }))).rejects.toThrow("Give it a name");
  await expect(createGoal(t.db, A, goal({ targetCents: 0 }))).rejects.toThrow("Enter a target above $0");
  await expect(createGoal(t.db, A, goal({ plannedCents: 100, plannedPer: null }))).rejects.toThrow("Enter a planned amount above $0");
  await expect(createGoal(t.db, A, goal({ trackAccountId: savings.id, trackCategoryId: investing!.id }))).rejects.toThrow("Choose one way to count it automatically");
  await expect(createGoal(t.db, A, goal({ startingCents: -1 }))).rejects.toThrow("Enter what's already saved as $0 or more");
  await expect(createGoal(t.db, A, goal({ targetDate: "2027-02-30" }))).rejects.toThrow("Enter a valid date");
  const bare = await createGoal(t.db, A, goal({ name: "Someday", targetCents: null }));
  await expect(addContribution(t.db, A, bare.id, { date: "2026-11-20", amountCents: 0 })).rejects.toThrow("Enter an amount");
});

it("marks goals done and back", async () => {
  const g = await createGoal(t.db, A, goal());
  expect(await setGoalStatus(t.db, A, g.id, "completed")).toMatchObject({ status: "completed", completedAt: expect.any(Date) });
  expect(await setGoalStatus(t.db, A, g.id, "active")).toMatchObject({ status: "active", completedAt: null });
});

it("adds money by hand, including withdrawals", async () => {
  const g = await createGoal(t.db, A, goal());
  await addContribution(t.db, A, g.id, { date: "2026-11-20", amountCents: 10_000, note: "birthday money" });
  await addContribution(t.db, A, g.id, { date: "2026-11-25", amountCents: -2_500 });
  expect((await listContributions(t.db, A, g.id)).map((c) => [c.amountCents, c.source, c.counted])).toEqual([
    [-2_500, "manual", true],
    [10_000, "manual", true],
  ]);
});

it("isolates users", async () => {
  const g = await createGoal(t.db, A, goal());
  await expect(updateGoal(t.db, B, g.id, goal())).rejects.toThrow(NotFoundError);
  await expect(deleteGoal(t.db, B, g.id)).rejects.toThrow(NotFoundError);
  await expect(moveGoal(t.db, B, g.id, "up")).rejects.toThrow(NotFoundError);
  await expect(addContribution(t.db, B, g.id, { date: "2026-11-20", amountCents: 100 })).rejects.toThrow(NotFoundError);
  await expect(createGoal(t.db, B, goal({ trackAccountId: savings.id }))).rejects.toThrow(NotFoundError);
  expect(await listGoals(t.db, B)).toEqual([]);
});
