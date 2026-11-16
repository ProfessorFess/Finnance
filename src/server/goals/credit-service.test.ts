import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { goalContributions, transactions } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { NotFoundError } from "@/server/finance/errors";
import { setTrackingStartDate } from "@/server/finance/settings";
import { setHidden } from "@/server/finance/transactions";
import { commitImport, undoImport } from "@/server/import/service";
import { createTestDb } from "@/test/db";
import { fixtureBytes } from "@/test/fixtures";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { creditGoals, linkTransactionToGoal, refreshGoals, regoal, setContributionCounted } from "./credit-service";
import { createGoal, type GoalInput, listContributions, setGoalStatus, updateGoal } from "./goals-service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let checking: Account;
let allySav: Account;

const goal = (over: Partial<GoalInput> = {}): GoalInput => ({
  name: "Emergency fund",
  type: "savings",
  targetCents: 1_000_000,
  targetDate: null,
  startingCents: 0,
  plannedCents: null,
  plannedPer: null,
  fundedByBucketId: null,
  trackAccountId: allySav.id,
  trackCategoryId: null,
  ...over,
});
/** A move from checking to Ally Savings; returns the savings (inflow) side. */
async function pair(date: string, cents: number, user = A, from = checking, to = allySav) {
  const pairId = randomUUID();
  const out = await insertTestTransaction(t.db, user, from.id, { amountCents: -cents, date, description: "Transfer to savings" });
  const inn = await insertTestTransaction(t.db, user, to.id, { amountCents: cents, date, description: "Transfer from checking" });
  for (const id of [out.id, inn.id]) await t.db.update(transactions).set({ transferPairId: pairId }).where(eq(transactions.id, id));
  return inn;
}
const amounts = async (goalId: string) => (await listContributions(t.db, A, goalId)).filter((c) => c.counted).map((c) => c.amountCents);

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

it("credits moves into a goal's account and spending in its category", async () => {
  const investing = (await listCategories(t.db, A)).find((c) => c.name === "Investing")!;
  const emergency = await createGoal(t.db, A, goal());
  const roth = await createGoal(t.db, A, goal({ name: "Roth IRA", type: "retirement", trackAccountId: null, trackCategoryId: investing.id }));
  await pair("2026-11-13", 40_000);
  const ira = await insertTestTransaction(t.db, A, checking.id, { amountCents: -50_000, date: "2026-11-20", description: "Brokerage" });
  await t.db.update(transactions).set({ categoryId: investing.id }).where(eq(transactions.id, ira.id));
  expect(await creditGoals(t.db, A)).toBe(2);
  expect(await amounts(emergency.id)).toEqual([40_000]);
  expect(await amounts(roth.id)).toEqual([50_000]);
  expect((await listContributions(t.db, A, roth.id))[0]!.source).toBe("auto");
  expect(await creditGoals(t.db, A)).toBe(0);
});

it("a transfer counts toward one goal, by priority, once", async () => {
  const emergency = await createGoal(t.db, A, goal());
  const vacation = await createGoal(t.db, A, goal({ name: "Vacation" }));
  const inn = await pair("2026-11-13", 40_000);
  await creditGoals(t.db, A);
  expect(await amounts(emergency.id)).toEqual([40_000]);
  expect(await amounts(vacation.id)).toEqual([]);
  await updateGoal(t.db, A, vacation.id, goal({ name: "Vacation trip" }));
  await regoal(t.db, A, emergency.id);
  expect(await t.db.select().from(goalContributions).where(eq(goalContributions.transactionId, inn.id))).toHaveLength(1);
});

it("counts only what happens after the goal's start date", async () => {
  const emergency = await createGoal(t.db, A, goal({ startDate: "2026-11-20" }));
  await pair("2026-11-13", 40_000);
  await pair("2026-11-27", 30_000);
  await creditGoals(t.db, A);
  expect(await amounts(emergency.id)).toEqual([30_000]);
});

it("a reached goal keeps its money until it's marked done, then the next goal gets it", async () => {
  const emergency = await createGoal(t.db, A, goal({ targetCents: 50_000, startingCents: 40_000 }));
  const vacation = await createGoal(t.db, A, goal({ name: "Vacation" }));
  await pair("2026-11-13", 40_000);
  await creditGoals(t.db, A);
  await pair("2026-11-20", 40_000);
  await creditGoals(t.db, A);
  expect((await amounts(emergency.id)).length).toBe(2);
  await setGoalStatus(t.db, A, emergency.id, "completed");
  await pair("2026-11-27", 40_000);
  await creditGoals(t.db, A);
  expect(await amounts(vacation.id)).toEqual([40_000]);
  expect((await amounts(emergency.id)).length).toBe(2);
});

it("undo, hiding, and \"doesn't count\" all take money back out", async () => {
  const emergency = await createGoal(t.db, A, goal());
  const inn = await pair("2026-11-13", 40_000);
  await creditGoals(t.db, A);
  await setHidden(t.db, A, inn.id, true);
  expect((await listContributions(t.db, A, emergency.id))[0]!.counted).toBe(false);
  await setHidden(t.db, A, inn.id, false);
  const [c] = await listContributions(t.db, A, emergency.id);
  expect(c!.counted).toBe(true);

  await setContributionCounted(t.db, A, c!.id, false);
  await creditGoals(t.db, A);
  expect(await amounts(emergency.id)).toEqual([]);

  const other = await pair("2026-11-20", 10_000);
  await linkTransactionToGoal(t.db, A, other.id, null);
  await creditGoals(t.db, A);
  expect(await amounts(emergency.id)).toEqual([]);

  // An undone import takes its credited transfers with it.
  const savingsAcct = await createAccount(t.db, A, { name: "UFCU Savings", type: "savings", institution: "UFCU", startingBalanceCents: 0 });
  const fund = await createGoal(t.db, A, goal({ name: "UFCU fund", trackAccountId: savingsAcct.id }));
  await commitImport(t.db, A, { file: { name: "c.csv", bytes: fixtureBytes("ufcu-checking.csv") }, accountId: checking.id });
  const batch = await commitImport(t.db, A, { file: { name: "s.csv", bytes: fixtureBytes("ufcu-savings.csv") }, accountId: savingsAcct.id });
  expect(await amounts(fund.id)).toEqual([10_000]);
  await undoImport(t.db, A, batch.batchId);
  expect(await amounts(fund.id)).toEqual([]);
});

it("links any transaction to a goal by hand", async () => {
  const emergency = await createGoal(t.db, A, goal({ trackAccountId: null }));
  const vacation = await createGoal(t.db, A, goal({ name: "Vacation", trackAccountId: null }));
  const venmo = await insertTestTransaction(t.db, A, checking.id, { amountCents: -12_000, date: "2026-11-21", description: "Venmo to Sam" });
  await linkTransactionToGoal(t.db, A, venmo.id, vacation.id);
  expect(await amounts(vacation.id)).toEqual([12_000]);
  expect((await listContributions(t.db, A, vacation.id))[0]!.source).toBe("linked");
  await linkTransactionToGoal(t.db, A, venmo.id, emergency.id);
  expect(await amounts(vacation.id)).toEqual([]);
  expect(await amounts(emergency.id)).toEqual([12_000]);
});

it("the import credits goals", async () => {
  const savingsAcct = await createAccount(t.db, A, { name: "UFCU Savings", type: "savings", institution: "UFCU", startingBalanceCents: 0 });
  const fund = await createGoal(t.db, A, goal({ trackAccountId: savingsAcct.id }));
  await commitImport(t.db, A, { file: { name: "c.csv", bytes: fixtureBytes("ufcu-checking.csv") }, accountId: checking.id });
  await commitImport(t.db, A, { file: { name: "s.csv", bytes: fixtureBytes("ufcu-savings.csv") }, accountId: savingsAcct.id });
  const credited = await listContributions(t.db, A, fund.id);
  expect(credited.map((c) => [c.date, c.amountCents, c.source])).toEqual([["2026-11-12", 10_000, "auto"]]);
});

it("isolates users", async () => {
  const emergency = await createGoal(t.db, A, goal());
  const inn = await pair("2026-11-13", 40_000);
  expect(await creditGoals(t.db, B)).toBe(0);
  await expect(linkTransactionToGoal(t.db, B, inn.id, null)).rejects.toThrow(NotFoundError);
  await setTrackingStartDate(t.db, B, "2026-11-07");
  const bAcct = await createAccount(t.db, B, { name: "B", type: "checking", startingBalanceCents: 0 });
  const bRow = await insertTestTransaction(t.db, B, bAcct.id, { amountCents: -100, date: "2026-11-20" });
  await expect(linkTransactionToGoal(t.db, B, bRow.id, emergency.id)).rejects.toThrow(NotFoundError);
  expect(await t.db.select().from(goalContributions).where(and(eq(goalContributions.userId, B)))).toEqual([]);
});

it("editing a done or paused goal keeps its history", async () => {
  const emergency = await createGoal(t.db, A, goal());
  const vacation = await createGoal(t.db, A, goal({ name: "Vacation" }));
  await pair("2026-11-13", 50_000);
  await creditGoals(t.db, A);
  await setGoalStatus(t.db, A, emergency.id, "completed");
  await updateGoal(t.db, A, emergency.id, goal({ name: "Emergency fund (done)" }));
  expect(await amounts(emergency.id)).toEqual([50_000]);
  expect(await amounts(vacation.id)).toEqual([]);
  // Reopening keeps it too.
  await setGoalStatus(t.db, A, emergency.id, "active");
  expect(await amounts(emergency.id)).toEqual([50_000]);
  // A paused goal renamed keeps its money.
  await setGoalStatus(t.db, A, emergency.id, "paused");
  await updateGoal(t.db, A, emergency.id, goal({ name: "Emergency fund" }));
  expect(await amounts(emergency.id)).toEqual([50_000]);
});

it("changing what a goal counts drops only credits that no longer fit", async () => {
  const other = await createAccount(t.db, A, { name: "Other savings", type: "savings", startingBalanceCents: 0 });
  const emergency = await createGoal(t.db, A, goal());
  await pair("2026-11-13", 40_000);
  await creditGoals(t.db, A);
  await pair("2026-11-20", 25_000, A, checking, other);
  await updateGoal(t.db, A, emergency.id, goal({ trackAccountId: other.id }));
  expect(await amounts(emergency.id)).toEqual([25_000]);
});

it("a transfer counts once even when either side is linked", async () => {
  const emergency = await createGoal(t.db, A, goal());
  const inn = await pair("2026-11-13", 40_000);
  await creditGoals(t.db, A);
  const [out] = await t.db.select().from(transactions).where(and(eq(transactions.userId, A), eq(transactions.amountCents, -40_000)));
  await linkTransactionToGoal(t.db, A, out!.id, emergency.id);
  expect(await amounts(emergency.id)).toEqual([40_000]);
  // The other order: link the checking side first, then crediting must skip the savings side.
  const second = await pair("2026-11-20", 30_000);
  const [out2] = await t.db.select().from(transactions).where(and(eq(transactions.userId, A), eq(transactions.amountCents, -30_000)));
  await linkTransactionToGoal(t.db, A, out2!.id, emergency.id);
  await creditGoals(t.db, A);
  expect((await amounts(emergency.id)).sort()).toEqual([30_000, 40_000]);
  void inn;
  void second;
});

it("recategorizing or un-pairing takes money back off a goal", async () => {
  const cats = await listCategories(t.db, A);
  const investing = cats.find((c) => c.name === "Investing")!;
  const gifts = cats.find((c) => c.name === "Gifts")!;
  const roth = await createGoal(t.db, A, goal({ name: "Roth IRA", trackAccountId: null, trackCategoryId: investing.id }));
  const ira = await insertTestTransaction(t.db, A, checking.id, { amountCents: -50_000, date: "2026-11-20", description: "Brokerage" });
  await t.db.update(transactions).set({ categoryId: investing.id }).where(eq(transactions.id, ira.id));
  await refreshGoals(t.db, A);
  expect(await amounts(roth.id)).toEqual([50_000]);
  await t.db.update(transactions).set({ categoryId: gifts.id }).where(eq(transactions.id, ira.id));
  await refreshGoals(t.db, A);
  expect(await amounts(roth.id)).toEqual([]);

  const emergency = await createGoal(t.db, A, goal());
  const inn = await pair("2026-11-13", 40_000);
  await refreshGoals(t.db, A);
  expect(await amounts(emergency.id)).toEqual([40_000]);
  await t.db.update(transactions).set({ transferPairId: "none" }).where(eq(transactions.id, inn.id));
  await refreshGoals(t.db, A);
  expect(await amounts(emergency.id)).toEqual([]);
});
