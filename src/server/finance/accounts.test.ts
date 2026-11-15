import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { archiveAccount, createAccount, listAccounts, updateAccount } from "./accounts";
import { listActivity } from "./activity";
import { NotFoundError } from "./errors";
import { setTrackingStartDate } from "./settings";

let t: Awaited<ReturnType<typeof createTestDb>>;
let userA: string;
let userB: string;

beforeEach(async () => {
  t = await createTestDb();
  userA = (await createTestUser(t.db)).id;
  userB = (await createTestUser(t.db)).id;
});
afterEach(async () => {
  await t.close();
});

const checking = { name: "UFCU Checking", type: "checking" as const, institution: "UFCU", startingBalanceCents: 152_034 };

it("creates an account and reports its starting balance as the balance", async () => {
  const a = await createAccount(t.db, userA, checking);
  const [listed] = await listAccounts(t.db, userA);
  expect(listed).toMatchObject({ id: a.id, name: "UFCU Checking", balanceCents: 152_034, lastImportAt: null });
});

it("adds transactions to the balance", async () => {
  const a = await createAccount(t.db, userA, checking);
  await insertTestTransaction(t.db, userA, a.id, { amountCents: -2_164 });
  await insertTestTransaction(t.db, userA, a.id, { amountCents: 120_000 });
  expect((await listAccounts(t.db, userA))[0]!.balanceCents).toBe(152_034 - 2_164 + 120_000);
});

it("rejects an empty name and a non-4-digit lastFour", async () => {
  await expect(createAccount(t.db, userA, { ...checking, name: " " })).rejects.toThrow(/name/i);
  await expect(createAccount(t.db, userA, { ...checking, lastFour: "12a4" })).rejects.toThrow(/last four/i);
});

it("hides archived accounts by default", async () => {
  const a = await createAccount(t.db, userA, checking);
  await archiveAccount(t.db, userA, a.id);
  expect(await listAccounts(t.db, userA)).toHaveLength(0);
  expect(await listAccounts(t.db, userA, { includeArchived: true })).toHaveLength(1);
});

it("records account changes in the activity log", async () => {
  const a = await createAccount(t.db, userA, checking);
  await updateAccount(t.db, userA, a.id, { name: "Checking" });
  const log = await listActivity(t.db, userA, "account", a.id);
  expect(log.map((e) => e.action)).toEqual(["account.update", "account.create"]);
});

it("isolates users", async () => {
  const a = await createAccount(t.db, userA, checking);
  expect(await listAccounts(t.db, userB)).toHaveLength(0);
  await expect(updateAccount(t.db, userB, a.id, { name: "x" })).rejects.toThrow(NotFoundError);
  await expect(archiveAccount(t.db, userB, a.id)).rejects.toThrow(NotFoundError);
});

it("balances count only transactions on or after the tracking start date", async () => {
  const a = await createAccount(t.db, userA, checking);
  await setTrackingStartDate(t.db, userA, "2026-11-07");
  await insertTestTransaction(t.db, userA, a.id, { amountCents: -500, date: "2026-11-06" });
  await insertTestTransaction(t.db, userA, a.id, { amountCents: -100, date: "2026-11-07" });
  expect((await listAccounts(t.db, userA))[0]!.balanceCents).toBe(152_034 - 100);
  // Moving the start date later drops the earlier rows from the balance.
  await setTrackingStartDate(t.db, userA, "2026-11-08");
  expect((await listAccounts(t.db, userA))[0]!.balanceCents).toBe(152_034);
});
