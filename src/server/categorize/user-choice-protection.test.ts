import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { transactions } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { setTrackingStartDate } from "@/server/finance/settings";
import { createManualTransaction } from "@/server/finance/transactions";
import { createTestDb } from "@/test/db";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { sortTransactions } from "./pipeline";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let acct: Account;

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-01");
  acct = await createAccount(t.db, A, { name: "Checking", type: "checking", startingBalanceCents: 0 });
});
afterEach(async () => {
  await t.close();
});

it("the 1b data migration marks categories chosen in Phase 1a as the user's", async () => {
  const gifts = (await listCategories(t.db, A)).find((c) => c.name === "Gifts")!;
  // A Phase 1a row: categorized by hand, with no categorization source (the column didn't exist yet).
  const row = await insertTestTransaction(t.db, A, acct.id, { amountCents: -1500, description: "Starbucks" });
  await t.db.update(transactions).set({ categoryId: gifts.id, categorizationSource: null }).where(eq(transactions.id, row.id));
  const uncategorized = await insertTestTransaction(t.db, A, acct.id, { amountCents: -500, description: "Haymaker" });

  await t.db.execute(sql.raw(readFileSync("drizzle/0003_backfill_user_categories.sql", "utf8")));
  await sortTransactions(t.db, A, { ai: null });

  const [kept] = await t.db.select().from(transactions).where(eq(transactions.id, row.id));
  expect(kept).toMatchObject({ categoryId: gifts.id, categorizationSource: "user" });
  const [other] = await t.db.select().from(transactions).where(eq(transactions.id, uncategorized.id));
  expect(other!.categorizationSource).not.toBe("user");
});

it("a cash entry added with a category is the user's choice", async () => {
  const gifts = (await listCategories(t.db, A)).find((c) => c.name === "Gifts")!;
  const tx = await createManualTransaction(t.db, A, { accountId: acct.id, date: "2026-11-10", description: "Starbucks", amountCents: -900, categoryId: gifts.id });
  expect(tx.categorizationSource).toBe("user");
  await sortTransactions(t.db, A, { ai: null });
  const [kept] = await t.db.select().from(transactions).where(eq(transactions.id, tx.id));
  expect(kept).toMatchObject({ categoryId: gifts.id, categorizationSource: "user" });
});
