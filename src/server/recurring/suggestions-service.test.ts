import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { activityLog, transactions } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { setTrackingStartDate } from "@/server/finance/settings";
import { createTestDb } from "@/test/db";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { createRecurringRule } from "./items-service";
import { dismissSuggestion, listSuggestions } from "./suggestions-service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let checking: Account;

const netflix = async (user = A, account = checking) => {
  const subs = (await listCategories(t.db, user)).find((c) => c.name === "Subscriptions")!;
  const ids: string[] = [];
  for (const date of ["2026-08-03", "2026-09-03", "2026-10-03", "2026-11-03"]) {
    const { id } = await insertTestTransaction(t.db, user, account.id, { amountCents: -1549, date, description: "NETFLIX.COM" });
    ids.push(id);
  }
  await t.db.update(transactions).set({ merchant: "Netflix", categoryId: subs.id, categorizationSource: "rule" }).where(inArray(transactions.id, ids));
  return ids;
};

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-08-01");
  await setTrackingStartDate(t.db, B, "2026-08-01");
  checking = await createAccount(t.db, A, { name: "UFCU Checking", type: "checking", startingBalanceCents: 0 });
});
afterEach(async () => {
  await t.close();
});

it("suggests untracked repeats, guessing the kind", async () => {
  await netflix();
  expect(await listSuggestions(t.db, A)).toEqual([
    expect.objectContaining({ merchantKey: "netflix", merchant: "Netflix", frequency: "monthly", amountCents: 1549, kindGuess: "subscription", categoryName: "Subscriptions", accountName: "UFCU Checking" }),
  ]);
});

it("drops merchants already tracked", async () => {
  await netflix();
  await createRecurringRule(t.db, A, {
    name: "Netflix", kind: "subscription", frequency: "monthly", anchorDate: "2026-12-03", secondDay: null, expectedCents: 1549,
    amountVaries: false, toleranceCents: null, accountId: checking.id, categoryId: null, matchPattern: "Netflix",
  });
  expect(await listSuggestions(t.db, A)).toEqual([]);
});

it("drops dismissed merchants and logs the dismissal", async () => {
  await netflix();
  await dismissSuggestion(t.db, A, "netflix");
  await dismissSuggestion(t.db, A, "netflix");
  expect(await listSuggestions(t.db, A)).toEqual([]);
  expect((await t.db.select().from(activityLog).where(eq(activityLog.action, "recurring_suggestion.dismiss"))).length).toBeGreaterThan(0);
});

it("ignores transfers and linked rows", async () => {
  const ids = await netflix();
  await t.db.update(transactions).set({ transferPairId: "pair-1" }).where(inArray(transactions.id, ids));
  expect(await listSuggestions(t.db, A)).toEqual([]);
});

it("isolates users", async () => {
  await netflix();
  expect(await listSuggestions(t.db, B)).toEqual([]);
  const bChecking = await createAccount(t.db, B, { name: "B Checking", type: "checking", startingBalanceCents: 0 });
  await netflix(B, bChecking);
  await dismissSuggestion(t.db, B, "netflix");
  expect(await listSuggestions(t.db, A)).toHaveLength(1);
});
