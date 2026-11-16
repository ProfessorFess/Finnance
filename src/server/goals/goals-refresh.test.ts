// Every way a category or a transfer pair changes keeps goals current (review fix I3).
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { transactions } from "@/server/db/schema";
import { chooseCategory } from "@/server/categorize/learn";
import { unpairTransfer } from "@/server/categorize/transfers-service";
import { type Account, createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { setTrackingStartDate } from "@/server/finance/settings";
import { createManualTransaction, setCategoryBulk } from "@/server/finance/transactions";
import { createTestDb } from "@/test/db";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { createGoal, type GoalInput, listContributions } from "./goals-service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let checking: Account;
let allySav: Account;
const goal = (over: Partial<GoalInput>): GoalInput => ({
  name: "Goal", type: "savings", targetCents: null, targetDate: null, startingCents: 0, plannedCents: null, plannedPer: null,
  fundedByBucketId: null, trackAccountId: null, trackCategoryId: null, ...over,
});
const counted = async (goalId: string) => (await listContributions(t.db, A, goalId)).filter((c) => c.counted).map((c) => c.amountCents);

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-07");
  checking = await createAccount(t.db, A, { name: "UFCU Checking", type: "checking", startingBalanceCents: 0 });
  allySav = await createAccount(t.db, A, { name: "Ally Savings", type: "savings", startingBalanceCents: 0 });
});
afterEach(async () => {
  await t.close();
});

it("choosing, bulk-changing, or adding a category keeps a category goal current", async () => {
  const cats = await listCategories(t.db, A);
  const investing = cats.find((c) => c.name === "Investing")!;
  const gifts = cats.find((c) => c.name === "Gifts")!;
  const roth = await createGoal(t.db, A, goal({ name: "Roth IRA", trackCategoryId: investing.id }));
  const row = await insertTestTransaction(t.db, A, checking.id, { amountCents: -50_000, date: "2026-11-20", description: "Brokerage" });
  await chooseCategory(t.db, A, row.id, investing.id);
  expect(await counted(roth.id)).toEqual([50_000]);
  await setCategoryBulk(t.db, A, [row.id], gifts.id);
  expect(await counted(roth.id)).toEqual([]);
  await createManualTransaction(t.db, A, { accountId: checking.id, date: "2026-11-22", description: "IRA top-up", amountCents: -20_000, categoryId: investing.id });
  expect(await counted(roth.id)).toEqual([20_000]);
});

it("\"Not a transfer\" takes a transfer back off a goal", async () => {
  const emergency = await createGoal(t.db, A, goal({ name: "Emergency", trackAccountId: allySav.id }));
  const pairId = randomUUID();
  const out = await insertTestTransaction(t.db, A, checking.id, { amountCents: -40_000, date: "2026-11-13", description: "Transfer out" });
  const inn = await insertTestTransaction(t.db, A, allySav.id, { amountCents: 40_000, date: "2026-11-13", description: "Transfer in" });
  for (const id of [out.id, inn.id]) await t.db.update(transactions).set({ transferPairId: pairId }).where(eq(transactions.id, id));
  await createGoal(t.db, A, goal({ name: "Nudge" })); // any goal change credits pending money
  expect(await counted(emergency.id)).toEqual([40_000]);
  await unpairTransfer(t.db, A, inn.id);
  expect(await counted(emergency.id)).toEqual([]);
});
