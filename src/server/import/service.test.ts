import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { transactions } from "@/server/db/schema";
import { type Account, createAccount, listAccounts } from "@/server/finance/accounts";
import { NotFoundError } from "@/server/finance/errors";
import { setTrackingStartDate } from "@/server/finance/settings";
import { createTestDb } from "@/test/db";
import { fixtureBytes } from "@/test/fixtures";
import { createTestUser } from "@/test/users";
import { commitImport, previewImport, undoImport } from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let checking: Account;
let spending: Account;

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-07");
  checking = await createAccount(t.db, A, { name: "UFCU Checking", type: "checking", institution: "UFCU", startingBalanceCents: 100_000 });
  spending = await createAccount(t.db, A, { name: "Ally Spending", type: "checking", institution: "Ally", startingBalanceCents: 0 });
  await createAccount(t.db, A, { name: "Ally Savings", type: "savings", institution: "Ally", startingBalanceCents: 0 });
});
afterEach(async () => {
  await t.close();
});

const ufcu = () => ({ name: "UFCU_Checking_Account.csv", bytes: fixtureBytes("ufcu-checking.csv") });
const ally = () => ({ name: "ALLY_Spending_Account.csv", bytes: fixtureBytes("ally-spending.csv") });

it("previews counts and suggests the account", async () => {
  const p = await previewImport(t.db, A, ufcu());
  expect(p).toMatchObject({ formatLabel: "UFCU export", needsMapping: false, suggestedAccountId: checking.id });
  expect(p.counts).toEqual({ rows: 7, pending: 1, beforeStart: 1, errors: 0, ready: 5 });
  expect(p.sample).toHaveLength(5);
});

it("skips pending rows and rows before the start date, and reports how many", async () => {
  const r = await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  expect(r).toMatchObject({ imported: 5, duplicates: 0, pending: 1, beforeStart: 1, errors: [] });
  const acc = (await listAccounts(t.db, A)).find((a) => a.id === checking.id);
  expect(acc!.balanceCents).toBe(100_000 - 2_164 + 120_000 - 625 - 625 - 10_000);
});

it("keeps identical same-day rows as separate transactions", async () => {
  await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  const rows = await t.db.select().from(transactions).where(eq(transactions.rawDescription, "Bennu Coffee"));
  expect(rows).toHaveLength(2);
});

it("re-importing the same file adds nothing", async () => {
  await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  expect(await commitImport(t.db, A, { file: ufcu(), accountId: checking.id })).toMatchObject({ imported: 0, duplicates: 5 });
});

it("learns the account's last four from a UFCU file, then suggests it", async () => {
  await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  expect((await listAccounts(t.db, A)).find((a) => a.id === checking.id)!.lastFour).toBe("1234");
  expect((await previewImport(t.db, A, ufcu())).suggestedAccountId).toBe(checking.id);
});

it("tells apart two UFCU accounts that share the same last four digits", async () => {
  const savings = await createAccount(t.db, A, { name: "UFCU Savings", type: "savings", institution: "UFCU", startingBalanceCents: 0 });
  await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  await commitImport(t.db, A, { file: { name: "UFCU_Savings_Account.csv", bytes: fixtureBytes("ufcu-savings.csv") }, accountId: savings.id });
  // Both accounts now have last four "1234"; the file's "Account name" column decides, even with an unhelpful file name.
  expect((await previewImport(t.db, A, { name: "export.csv", bytes: fixtureBytes("ufcu-savings.csv") })).suggestedAccountId).toBe(savings.id);
  expect((await previewImport(t.db, A, { name: "export.csv", bytes: fixtureBytes("ufcu-checking.csv") })).suggestedAccountId).toBe(checking.id);
});

it("doesn't send a first-time savings file to checking just because the last four match", async () => {
  const savings = await createAccount(t.db, A, { name: "UFCU Savings", type: "savings", institution: "UFCU", startingBalanceCents: 0 });
  await commitImport(t.db, A, { file: ufcu(), accountId: checking.id }); // checking learns "1234"; savings hasn't yet
  expect((await previewImport(t.db, A, { name: "export.csv", bytes: fixtureBytes("ufcu-savings.csv") })).suggestedAccountId).toBe(savings.id);
});

it("suggests the Ally account by file name", async () => {
  expect((await previewImport(t.db, A, ally())).suggestedAccountId).toBe(spending.id);
});

it("undo removes the batch's transactions once", async () => {
  const r = await commitImport(t.db, A, { file: ally(), accountId: spending.id });
  expect(await undoImport(t.db, A, r.batchId)).toEqual({ removed: 3 });
  await expect(undoImport(t.db, A, r.batchId)).rejects.toThrow(/Already undone/);
});

it("saves a confirmed mapping as a profile for next time", async () => {
  const file = { name: "bank.csv", bytes: fixtureBytes("generic-bad.csv") };
  const p = await previewImport(t.db, A, file);
  expect(p.needsMapping).toBe(true);
  await commitImport(t.db, A, { file, accountId: checking.id, mapping: p.mapping! });
  expect((await previewImport(t.db, A, file)).formatLabel).toBe("Saved format");
});

it("doesn't save a column layout from an import that brought in nothing", async () => {
  const file = { name: "bank.csv", bytes: fixtureBytes("generic-bad.csv") };
  const p = await previewImport(t.db, A, file);
  // Wrong date format: every row fails, nothing imports.
  const wrong = { ...p.mapping!, date: { ...p.mapping!.date, format: "MM/DD/YYYY" as const } };
  const r = await commitImport(t.db, A, { file, accountId: checking.id, mapping: wrong });
  expect(r.imported + r.duplicates).toBe(0);
  expect((await previewImport(t.db, A, file)).needsMapping).toBe(true);
});

it("a corrected column layout replaces the saved one", async () => {
  const file = { name: "bank.csv", bytes: fixtureBytes("generic-bad.csv") };
  const p = await previewImport(t.db, A, file);
  const inverted = { ...p.mapping!, amount: { kind: "signed" as const, column: "Amount", invert: true } };
  await commitImport(t.db, A, { file, accountId: checking.id, mapping: inverted });
  expect((await previewImport(t.db, A, file)).sample[0]!.amountCents).toBe(1200);
  await commitImport(t.db, A, { file, accountId: spending.id, mapping: p.mapping! });
  expect((await previewImport(t.db, A, file)).sample[0]!.amountCents).toBe(-1200);
});

it("requires a mapping for an unrecognized layout", async () => {
  const file = { name: "bank.csv", bytes: fixtureBytes("generic-bad.csv") };
  await expect(commitImport(t.db, A, { file, accountId: checking.id })).rejects.toThrow(/columns/);
});

it("stores a cleaned-up merchant on imported rows", async () => {
  await commitImport(t.db, A, { file: ally(), accountId: spending.id });
  const rows = await t.db.select().from(transactions).where(eq(transactions.accountId, spending.id));
  expect(rows.find((r) => r.rawDescription.startsWith("CORNER STORE"))!.merchant).toBe("Corner Store");
});

it("adds only the new identical row when a later file has one more same-day coffee", async () => {
  const header = "Date, Time, Amount, Type, Description";
  const oneCoffee = [header, "2026-11-13,08:00:00,-6.25,Withdrawal,Bennu Coffee"].join("\n");
  const twoCoffees = [header, "2026-11-13,08:00:00,-6.25,Withdrawal,Bennu Coffee", "2026-11-13,15:00:00,-6.25,Withdrawal,Bennu Coffee"].join("\n");
  const file = (text: string) => ({ name: "ally_spending.csv", bytes: new TextEncoder().encode(text) });
  expect((await commitImport(t.db, A, { file: file(oneCoffee), accountId: spending.id })).imported).toBe(1);
  expect(await commitImport(t.db, A, { file: file(twoCoffees), accountId: spending.id })).toMatchObject({ imported: 1, duplicates: 1 });
});

it("includes rows dated exactly on the start date", async () => {
  await setTrackingStartDate(t.db, A, "2026-11-12");
  const r = await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  expect(r).toMatchObject({ imported: 5, beforeStart: 1 });
  const rows = await t.db.select().from(transactions).where(eq(transactions.date, "2026-11-12"));
  expect(rows).toHaveLength(1);
});

it("re-imports cleanly after an undo", async () => {
  const first = await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  await undoImport(t.db, A, first.batchId);
  expect((await commitImport(t.db, A, { file: ufcu(), accountId: checking.id })).imported).toBe(5);
});

it("requires a tracking start date", async () => {
  await expect(previewImport(t.db, B, ufcu())).rejects.toThrow(/start date/);
});

it("isolates users", async () => {
  await setTrackingStartDate(t.db, B, "2026-11-07");
  await expect(commitImport(t.db, B, { file: ufcu(), accountId: checking.id })).rejects.toThrow(NotFoundError);
  const r = await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  await expect(undoImport(t.db, B, r.batchId)).rejects.toThrow(NotFoundError);
});

it("imports a 5,000-row file in batches under 5 seconds", async () => {
  const lines = ["Date, Time, Amount, Type, Description"];
  for (let i = 0; i < 5000; i++) {
    lines.push(`2026-11-${String(8 + (i % 20)).padStart(2, "0")},12:00:00,-1.${String(i % 100).padStart(2, "0")},Withdrawal,Row ${i}`);
  }
  const started = performance.now();
  const r = await commitImport(t.db, A, {
    file: { name: "ally_spending.csv", bytes: new TextEncoder().encode(lines.join("\n")) },
    accountId: spending.id,
  });
  expect(r.imported).toBe(5000);
  expect(performance.now() - started).toBeLessThan(5000);
});
