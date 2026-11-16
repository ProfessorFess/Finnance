import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { NOT_A_TRANSFER, transactions } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { NotFoundError } from "@/server/finance/errors";
import { createTestDb } from "@/test/db";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { setCategoryBulk, updateTransaction } from "@/server/finance/transactions";
import { clearDanglingPairs, detectTransfers, unpairTransfer } from "./transfers-service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let ufcu: Account;
let ally: Account;

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
  ufcu = await createAccount(t.db, A, { name: "UFCU Checking", type: "checking", startingBalanceCents: 0 });
  ally = await createAccount(t.db, A, { name: "Ally Spending", type: "checking", startingBalanceCents: 0 });
});
afterEach(async () => {
  await t.close();
});

const zellePair = async (user = A, from = ufcu.id, to = ally.id) => {
  const out = await insertTestTransaction(t.db, user, from, { amountCents: -5000, date: "2026-11-03", description: "Zelle transfer to A SAMPLE" });
  const inn = await insertTestTransaction(t.db, user, to, { amountCents: 5000, date: "2026-11-03", description: "Zelle payment from A SAMPLE to A Sample" });
  return { out, inn };
};
const rows = (ids: string[]) => t.db.select().from(transactions).where(inArray(transactions.id, ids));

it("labels both sides as Transfer and links them", async () => {
  const { out, inn } = await zellePair();
  expect(await detectTransfers(t.db, A)).toBe(1);
  const transfer = (await listCategories(t.db, A)).find((c) => c.name === "Transfer")!;
  const [a, b] = await rows([out.id, inn.id]);
  expect(a!.transferPairId).toBeTruthy();
  expect(a!.transferPairId).toBe(b!.transferPairId);
  for (const r of [a!, b!]) expect(r).toMatchObject({ categoryId: transfer.id, categorizationSource: "transfer", needsReview: false });
});

it("leaves user-categorized rows and \"not a transfer\" rows alone", async () => {
  const first = await zellePair();
  await t.db.update(transactions).set({ categorizationSource: "user" }).where(eq(transactions.id, first.out.id));
  expect(await detectTransfers(t.db, A)).toBe(0);

  await t.db.update(transactions).set({ categorizationSource: null }).where(eq(transactions.id, first.out.id));
  expect(await detectTransfers(t.db, A)).toBe(1);
  await unpairTransfer(t.db, A, first.out.id);
  const [a, b] = await rows([first.out.id, first.inn.id]);
  for (const r of [a!, b!]) expect(r).toMatchObject({ transferPairId: NOT_A_TRANSFER, categoryId: null, needsReview: true });
  expect(await detectTransfers(t.db, A)).toBe(0);
});

it("only looks near the given date range", async () => {
  await zellePair();
  expect(await detectTransfers(t.db, A, { from: "2026-11-20", to: "2026-11-25" })).toBe(0);
  expect(await detectTransfers(t.db, A, { from: "2026-11-05", to: "2026-11-06" })).toBe(1);
});

it("isolates users", async () => {
  const bAcct = await createAccount(t.db, B, { name: "B", type: "checking", startingBalanceCents: 0 });
  await insertTestTransaction(t.db, A, ufcu.id, { amountCents: -5000, date: "2026-11-03", description: "Zelle transfer to A SAMPLE" });
  await insertTestTransaction(t.db, B, bAcct.id, { amountCents: 5000, date: "2026-11-03", description: "Zelle payment from A SAMPLE" });
  expect(await detectTransfers(t.db, A)).toBe(0);
  expect(await detectTransfers(t.db, B)).toBe(0);
  const { out } = await zellePair();
  await expect(unpairTransfer(t.db, B, out.id)).rejects.toThrow(NotFoundError);
});

it("hand-setting a category on a paired row un-pairs it and sends the partner to review", async () => {
  const { out, inn } = await zellePair();
  await detectTransfers(t.db, A);
  const gifts = (await listCategories(t.db, A)).find((c) => c.name === "Gifts")!;
  await updateTransaction(t.db, A, out.id, { categoryId: gifts.id });
  const [a, b] = await rows([out.id, inn.id]);
  expect(a).toMatchObject({ transferPairId: NOT_A_TRANSFER, categoryId: gifts.id, categorizationSource: "user" });
  expect(b).toMatchObject({ transferPairId: null, categoryId: null, needsReview: true });
});

it("bulk-categorizing a paired row un-pairs it too", async () => {
  const { out, inn } = await zellePair();
  await detectTransfers(t.db, A);
  const gifts = (await listCategories(t.db, A)).find((c) => c.name === "Gifts")!;
  await setCategoryBulk(t.db, A, [out.id], gifts.id);
  const [a, b] = await rows([out.id, inn.id]);
  expect(a).toMatchObject({ transferPairId: NOT_A_TRANSFER, categoryId: gifts.id });
  expect(b!.transferPairId).toBeNull();
});

it("cleaning up a broken pair keeps a category the user chose", async () => {
  const { out } = await zellePair();
  const gifts = (await listCategories(t.db, A)).find((c) => c.name === "Gifts")!;
  await t.db.update(transactions).set({ transferPairId: "lonely-pair", categoryId: gifts.id, categorizationSource: "user" }).where(eq(transactions.id, out.id));
  await clearDanglingPairs(t.db, A);
  const [a] = await rows([out.id]);
  expect(a).toMatchObject({ transferPairId: null, categoryId: gifts.id, categorizationSource: "user" });
});
