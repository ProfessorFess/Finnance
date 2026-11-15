import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { transactions } from "@/server/db/schema";
import { commitImport } from "@/server/import/service";
import { createTestDb } from "@/test/db";
import { fixtureBytes } from "@/test/fixtures";
import { createTestUser } from "@/test/users";
import { type Account, createAccount, listAccounts } from "./accounts";
import { listCategories } from "./categories";
import { NotFoundError } from "./errors";
import { setTrackingStartDate } from "./settings";
import {
  createManualTransaction,
  deleteTransaction,
  getTransactionHistory,
  listTransactions,
  setCategoryBulk,
  setHidden,
  updateTransaction,
} from "./transactions";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let checking: Account;

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-07");
  checking = await createAccount(t.db, A, { name: "UFCU Checking", type: "checking", institution: "UFCU", startingBalanceCents: 0 });
  await commitImport(t.db, A, { file: { name: "ufcu.csv", bytes: fixtureBytes("ufcu-checking.csv") }, accountId: checking.id });
});
afterEach(async () => {
  await t.close();
});

it("lists newest first with account names", async () => {
  const { items } = await listTransactions(t.db, A, {});
  expect(items.map((i) => i.date)).toEqual(["2026-11-14", "2026-11-14", "2026-11-13", "2026-11-13", "2026-11-12"]);
  expect(items[0]!.accountName).toBe("UFCU Checking");
});

it("searches descriptions case-insensitively and literally", async () => {
  expect((await listTransactions(t.db, A, { search: "bennu" })).items).toHaveLength(2);
  expect((await listTransactions(t.db, A, { search: "%" })).items).toHaveLength(0);
});

it("filters by date range, account, and uncategorized", async () => {
  expect((await listTransactions(t.db, A, { from: "2026-11-13", to: "2026-11-13" })).items).toHaveLength(2);
  expect((await listTransactions(t.db, A, { accountId: checking.id })).items).toHaveLength(5);
  // Prime Video is sorted by a built-in rule on import (Phase 1b), so 4 remain.
  expect((await listTransactions(t.db, A, { categoryId: "uncategorized" })).items).toHaveLength(4);
});

it("paginates with a cursor", async () => {
  const first = await listTransactions(t.db, A, { limit: 2 });
  const second = await listTransactions(t.db, A, { limit: 2, cursor: first.nextCursor! });
  const third = await listTransactions(t.db, A, { limit: 2, cursor: second.nextCursor! });
  expect(new Set([...first.items, ...second.items, ...third.items].map((i) => i.id)).size).toBe(5);
  expect(third.nextCursor).toBeNull();
});

it("paginates rows that share a date and an insert time without skipping any", async () => {
  await t.db.transaction(async (tx) => {
    for (let i = 0; i < 7; i++) {
      await tx.insert(transactions).values({
        userId: A, accountId: checking.id, date: "2026-11-20", amountCents: -100 - i,
        rawDescription: `Same instant ${i}`, source: "manual", dedupeHash: `test:${randomUUID()}`,
        // Real Postgres stores microseconds; one import's rows all share the same instant.
        createdAt: sql`'2026-11-20 10:00:00.123456'::timestamp`,
      });
    }
  });
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await listTransactions(t.db, A, { search: "Same instant", limit: 2, cursor });
    seen.push(...page.items.map((i) => i.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(new Set(seen).size).toBe(7);
  expect(seen).toHaveLength(7);
});

it("lists only transactions on or after the tracking start date", async () => {
  await setTrackingStartDate(t.db, A, "2026-11-13");
  const { items } = await listTransactions(t.db, A, {});
  expect(items.map((i) => i.date)).toEqual(["2026-11-14", "2026-11-14", "2026-11-13", "2026-11-13"]);
});

it("rejects a manual transaction dated before the tracking start date", async () => {
  await expect(
    createManualTransaction(t.db, A, { accountId: checking.id, date: "2026-11-06", description: "Too early", amountCents: -100 }),
  ).rejects.toThrow(/before your tracking start date/);
});

it("hides a duplicate imported row from balances and lists, and re-importing doesn't bring it back", async () => {
  const before = (await listAccounts(t.db, A))[0]!.balanceCents;
  const [coffee] = (await listTransactions(t.db, A, { search: "Bennu" })).items;
  await setHidden(t.db, A, coffee!.id, true);
  expect((await listAccounts(t.db, A))[0]!.balanceCents).toBe(before + 625);
  expect((await listTransactions(t.db, A, { search: "Bennu" })).items).toHaveLength(1);
  expect((await listTransactions(t.db, A, { search: "Bennu", includeHidden: true })).items.find((i) => i.id === coffee!.id)?.hidden).toBe(true);
  await commitImport(t.db, A, { file: { name: "ufcu.csv", bytes: fixtureBytes("ufcu-checking.csv") }, accountId: checking.id });
  expect((await listTransactions(t.db, A, { search: "Bennu" })).items).toHaveLength(1);
  expect((await getTransactionHistory(t.db, A, coffee!.id))[0]!.action).toBe("transaction.hide");
});

it("unhides a row", async () => {
  const [row] = (await listTransactions(t.db, A, {})).items;
  await setHidden(t.db, A, row!.id, true);
  await setHidden(t.db, A, row!.id, false);
  expect((await listTransactions(t.db, A, {})).items).toHaveLength(5);
  await expect(setHidden(t.db, B, row!.id, true)).rejects.toThrow(NotFoundError);
});

it("filters to rows that need review", async () => {
  const { items } = await listTransactions(t.db, A, { needsReview: true });
  expect(items.length).toBeGreaterThan(0);
  expect(items.every((i) => i.needsReview)).toBe(true);
});

it("adds a manual cash transaction and records it", async () => {
  const tx = await createManualTransaction(t.db, A, { accountId: checking.id, date: "2026-11-14", description: "Farmers market", amountCents: -1_800 });
  expect(tx.source).toBe("manual");
  expect((await getTransactionHistory(t.db, A, tx.id)).map((e) => e.action)).toEqual(["transaction.create"]);
});

it("categorizes in bulk and logs each change", async () => {
  const coffee = (await listCategories(t.db, A)).find((c) => c.name === "Coffee")!;
  const ids = (await listTransactions(t.db, A, { search: "Bennu" })).items.map((i) => i.id);
  expect(await setCategoryBulk(t.db, A, ids, coffee.id)).toBe(2);
  expect((await getTransactionHistory(t.db, A, ids[0]!))[0]!.action).toBe("transaction.bulk_categorize");
  expect((await listTransactions(t.db, A, { categoryId: coffee.id })).items.map((i) => i.categoryName)).toEqual(["Coffee", "Coffee"]);
});

it("won't edit an imported amount or delete an imported row", async () => {
  const [imported] = (await listTransactions(t.db, A, {})).items;
  await expect(updateTransaction(t.db, A, imported!.id, { amountCents: 1 })).rejects.toThrow(/can't be edited/);
  await expect(deleteTransaction(t.db, A, imported!.id)).rejects.toThrow(/undo the import/i);
});

it("edits notes on an imported row and deletes a manual one", async () => {
  const [imported] = (await listTransactions(t.db, A, {})).items;
  expect((await updateTransaction(t.db, A, imported!.id, { notes: "lunch with Sam" })).notes).toBe("lunch with Sam");
  const manual = await createManualTransaction(t.db, A, { accountId: checking.id, date: "2026-11-14", description: "Cash", amountCents: -500 });
  await deleteTransaction(t.db, A, manual.id);
  expect((await listTransactions(t.db, A, { search: "Cash" })).items).toHaveLength(0);
});

it("isolates users", async () => {
  const [row] = (await listTransactions(t.db, A, {})).items;
  expect((await listTransactions(t.db, B, {})).items).toHaveLength(0);
  await expect(updateTransaction(t.db, B, row!.id, { notes: "x" })).rejects.toThrow(NotFoundError);
  const bCat = (await listCategories(t.db, B))[0]!;
  await expect(updateTransaction(t.db, A, row!.id, { categoryId: bCat.id })).rejects.toThrow(NotFoundError);
  expect(await setCategoryBulk(t.db, B, [row!.id], bCat.id)).toBe(0);
  await expect(createManualTransaction(t.db, B, { accountId: checking.id, date: "2026-11-14", description: "x", amountCents: -1 })).rejects.toThrow(NotFoundError);
});
