import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { transactions } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { setTrackingStartDate } from "@/server/finance/settings";
import { createGoal } from "@/server/goals/goals-service";
import { transferPair } from "@/server/goals/test-helpers";
import { createIncomeSource, createRecurringRule, type RecurringRuleInput } from "@/server/recurring/items-service";
import { createTestDb } from "@/test/db";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { getNeedsAttention, getSpendingByCategory, getUpcoming } from "./insights";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let checking: Account;
let savings: Account;
let cat: Map<string, string>;
const now = new Date("2026-11-20T18:00:00Z");

async function tx(cents: number, date: string, o: { category?: string; hidden?: boolean; csv?: boolean; review?: boolean } = {}) {
  const row = await insertTestTransaction(t.db, A, checking.id, { amountCents: cents, date });
  await t.db
    .update(transactions)
    .set({
      categoryId: o.category ? cat.get(o.category)! : null,
      status: o.hidden ? "excluded" : "cleared",
      source: o.csv ? "csv" : "manual",
      needsReview: o.review ?? false,
    })
    .where(eq(transactions.id, row.id));
  return row;
}

const rule = (over: Partial<RecurringRuleInput>): RecurringRuleInput => ({
  name: "Netflix", kind: "subscription", frequency: "monthly", anchorDate: "2026-11-25", secondDay: null, expectedCents: 1549, amountVaries: false,
  toleranceCents: null, accountId: null, categoryId: null, matchPattern: "Netflix", ...over,
});

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-01");
  checking = await createAccount(t.db, A, { name: "Checking", type: "checking", startingBalanceCents: 0 });
  savings = await createAccount(t.db, A, { name: "Ally Savings", type: "savings", startingBalanceCents: 0 });
  cat = new Map((await listCategories(t.db, A)).map((c) => [c.name, c.id]));
});
afterEach(async () => {
  await t.close();
});

it("spending by category counts only real spending", async () => {
  await tx(-625, "2026-11-03", { category: "Coffee" });
  await tx(125, "2026-11-04", { category: "Coffee" });
  await tx(-4500, "2026-11-05", { category: "Groceries" });
  await transferPair(t.db, A, checking.id, savings.id, "2026-11-06", 40_000);
  await tx(-1000, "2026-11-07", { category: "Transfer" });
  await tx(-9000, "2026-11-08", { category: "Coffee", hidden: true });
  await tx(120_000, "2026-11-09", { category: "Paycheck" });
  await tx(-300, "2026-11-10");
  await tx(-777, "2026-10-28", { category: "Coffee" });
  const s = await getSpendingByCategory(t.db, A, now);
  expect(s.rows.map((r) => [r.name, r.cents])).toEqual([
    ["Groceries", 4500],
    ["Coffee", 500],
    ["Uncategorized", 300],
  ]);
  expect(s).toMatchObject({ month: "2026-11", totalCents: 5300 });
  expect((await getSpendingByCategory(t.db, B, now)).rows).toEqual([]);
});

it("hides comparisons in the first month", async () => {
  expect(await getSpendingByCategory(t.db, A, now)).toMatchObject({ firstMonth: true, previousTotalCents: null });
  await setTrackingStartDate(t.db, A, "2026-10-15");
  expect(await getSpendingByCategory(t.db, A, now)).toMatchObject({ firstMonth: true, previousTotalCents: null });
  await setTrackingStartDate(t.db, A, "2026-10-01");
  await tx(-7000, "2026-10-10", { category: "Groceries" });
  expect(await getSpendingByCategory(t.db, A, now)).toMatchObject({ firstMonth: false, previousTotalCents: 7000 });
});

it("lists what's coming in the next two weeks", async () => {
  await createIncomeSource(t.db, A, {
    name: "Paycheck", type: "salary", frequency: "biweekly", anchorDate: "2026-11-14", secondDay: null, amountMode: "fixed",
    expectedCents: 120_000, accountId: checking.id, categoryId: null, matchPattern: "Payroll",
  });
  await createRecurringRule(t.db, A, rule({}));
  await createRecurringRule(t.db, A, rule({ name: "Gym", kind: "bill", anchorDate: "2026-11-22", active: false }));
  await createRecurringRule(t.db, A, rule({ name: "Insurance", kind: "bill", anchorDate: "2026-12-15" }));
  expect(await getUpcoming(t.db, A, now)).toEqual([
    { kind: "subscription", name: "Netflix", date: "2026-11-25", amountCents: 1549 },
    { kind: "income", name: "Paycheck", date: "2026-11-28", amountCents: 120_000 },
  ]);
});

it("collects what needs attention, with where to go", async () => {
  await tx(-500, "2026-11-19", { csv: true, review: true, category: "Coffee" });
  await createRecurringRule(t.db, A, rule({ name: "Phone", kind: "bill", anchorDate: "2026-11-10", accountId: checking.id }));
  await createGoal(t.db, A, {
    name: "Starter fund", type: "savings", targetCents: 10_000, targetDate: null, startingCents: 20_000, plannedCents: null, plannedPer: null,
    fundedByBucketId: null, trackAccountId: null, trackCategoryId: null,
  });
  const items = await getNeedsAttention(t.db, A, now);
  expect(items.map((i) => [i.key, i.href])).toEqual([
    ["review", "/transactions/review"],
    ["late", "/recurring"],
    ["goal_done", "/goals"],
  ]);
  expect(items[1]!.text).toBe("Phone is late (expected Nov 10, 2026)");
  expect(await getNeedsAttention(t.db, B, now)).toEqual([]);
});
