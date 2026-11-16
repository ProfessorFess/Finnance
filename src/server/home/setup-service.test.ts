import { afterEach, beforeEach, expect, it } from "vitest";
import { createAccount } from "@/server/finance/accounts";
import { setTrackingStartDate } from "@/server/finance/settings";
import { createGoal } from "@/server/goals/goals-service";
import { ownerPlan } from "@/server/goals/test-helpers";
import { createTestDb } from "@/test/db";
import { createTestUser } from "@/test/users";
import { listRecurringRules } from "@/server/recurring/items-service";
import { addCommonSubscriptions, getSetupStatus, skipSetupStep, unskipSetupStep } from "./setup-service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;

const goal = { name: "Emergency fund", type: "savings" as const, targetCents: 1_000_000, targetDate: null, startingCents: 0, plannedCents: null, plannedPer: null,
  fundedByBucketId: null, trackAccountId: null, trackCategoryId: null };

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
});
afterEach(async () => {
  await t.close();
});

const doneMap = async (userId: string) =>
  Object.fromEntries((await getSetupStatus(t.db, userId)).steps.map((s) => [s.key, s.done]));

it("setup knows what's already done", async () => {
  await setTrackingStartDate(t.db, A, "2026-11-07");
  const checking = await createAccount(t.db, A, { name: "Checking", type: "checking", startingBalanceCents: 0 });
  const savings = await createAccount(t.db, A, { name: "Savings", type: "savings", startingBalanceCents: 0 });
  await ownerPlan(t.db, A, checking.id, savings.id);
  expect(await doneMap(A)).toEqual({ start_date: true, accounts: true, income: true, plan: true, bills: false, goals: false });
  const s = await getSetupStatus(t.db, A);
  expect(s).toMatchObject({ complete: false, nextStep: "bills" });
  expect(s.steps[0]).toMatchObject({ title: "Choose your start date", href: "/setup?step=start_date" });
  await skipSetupStep(t.db, A, "bills");
  await createGoal(t.db, A, goal);
  expect(await getSetupStatus(t.db, A)).toMatchObject({ complete: true, nextStep: null });
});

it("a brand-new user starts at the start date", async () => {
  const s = await getSetupStatus(t.db, A);
  expect(s.steps.map((x) => x.done)).toEqual([false, false, false, false, false, false]);
  expect(s.nextStep).toBe("start_date");
});

it("skipping can be undone", async () => {
  await skipSetupStep(t.db, A, "goals");
  await skipSetupStep(t.db, A, "goals");
  expect((await getSetupStatus(t.db, A)).steps.find((s) => s.key === "goals")!.skipped).toBe(true);
  await unskipSetupStep(t.db, A, "goals");
  expect((await getSetupStatus(t.db, A)).steps.find((s) => s.key === "goals")!.skipped).toBe(false);
});

it("isolates users", async () => {
  await skipSetupStep(t.db, B, "goals");
  await setTrackingStartDate(t.db, B, "2026-11-07");
  const a = await getSetupStatus(t.db, A);
  expect(a.steps.find((s) => s.key === "goals")!.skipped).toBe(false);
  expect(a.steps.find((s) => s.key === "start_date")!.done).toBe(false);
});

it("adds picked subscriptions as monthly items", async () => {
  await addCommonSubscriptions(t.db, A, [
    { name: "Netflix", cents: 1799, matchPattern: "Netflix", anchorDate: "2026-11-16" },
    { name: "Spotify", cents: 1199, matchPattern: "Spotify", anchorDate: "2026-11-16" },
  ]);
  const rules = await listRecurringRules(t.db, A);
  expect(rules.map((r) => [r.name, r.kind, r.frequency, r.expectedCents, r.anchorDate, r.active])).toEqual([
    ["Netflix", "subscription", "monthly", 1799, "2026-11-16", true],
    ["Spotify", "subscription", "monthly", 1199, "2026-11-16", true],
  ]);
  expect((await getSetupStatus(t.db, A)).steps.find((s) => s.key === "bills")!.done).toBe(true);
  await expect(addCommonSubscriptions(t.db, A, [{ name: "Hulu", cents: 0, matchPattern: "Hulu", anchorDate: "2026-11-16" }])).rejects.toThrow();
  expect(await listRecurringRules(t.db, B)).toEqual([]);
});
