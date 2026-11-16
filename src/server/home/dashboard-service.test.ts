import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { activityLog, dashboards } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { setTrackingStartDate } from "@/server/finance/settings";
import { ownerPlan } from "@/server/goals/test-helpers";
import { deletePlan, getActivePlan } from "@/server/plan/plans-service";
import { createTestDb } from "@/test/db";
import { createTestUser } from "@/test/users";
import { ensureHomeDashboard, loadHome } from "./dashboard-service";
import { monthlyPlan } from "./test-helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let checking: Account;
let savings: Account;
const now = new Date("2026-11-20T18:00:00Z");
const types = async (userId: string) => (await ensureHomeDashboard(t.db, userId)).widgets.map((w) => w.type);

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-07");
  checking = await createAccount(t.db, A, { name: "Checking", type: "checking", startingBalanceCents: 0 });
  savings = await createAccount(t.db, A, { name: "Ally Savings", type: "savings", startingBalanceCents: 0 });
});
afterEach(async () => {
  await t.close();
});

it("the owner's Home follows the spreadsheet's order", async () => {
  await ownerPlan(t.db, A, checking.id, savings.id);
  const first = await ensureHomeDashboard(t.db, A);
  expect(first.widgets.map((w) => w.type)).toEqual([
    "bucket_status", "paycheck_tasks", "plan_overview", "goals", "upcoming", "spending_by_category", "needs_attention", "recent_transactions",
  ]);
  expect(first.widgets[0]!.size).toBe("lg");
  expect((await ensureHomeDashboard(t.db, A)).widgets.map((w) => w.id)).toEqual(first.widgets.map((w) => w.id));
});

it("other households get layouts that fit them", async () => {
  await monthlyPlan(t.db, A, checking.id);
  expect(await types(A)).toEqual(["plan_overview", "goals", "upcoming", "spending_by_category", "needs_attention", "recent_transactions"]);
  await monthlyPlan(t.db, B, (await createAccount(t.db, B, { name: "Checking", type: "checking", startingBalanceCents: 0 })).id, { cadence: "per_income" });
  expect((await types(B))[0]).toBe("paycheck_tasks");
});

it("follows the plan until the layout is customized", async () => {
  const none = await ensureHomeDashboard(t.db, A);
  expect(none.widgets[0]!.type).toBe("needs_attention");
  await ownerPlan(t.db, A, checking.id, savings.id);
  expect((await types(A))[0]).toBe("bucket_status");
  expect((await t.db.select().from(activityLog).where(and(eq(activityLog.userId, A), eq(activityLog.entityType, "dashboard")))).map((a) => a.action)).toEqual([
    "dashboard.create", "dashboard.reset",
  ]);
  await t.db.update(dashboards).set({ customized: true }).where(eq(dashboards.userId, A));
  await deletePlan(t.db, A, (await getActivePlan(t.db, A))!.plan.id);
  expect((await types(A))[0]).toBe("bucket_status");
});

it("a new user gets a useful Home", async () => {
  const fresh = (await createTestUser(t.db)).id;
  const home = await loadHome(t.db, fresh, now);
  expect(home.setupIncomplete).toBe(true);
  expect(home.widgets.map((w) => w.type)).toEqual(["setup", "needs_attention", "upcoming", "goals", "spending_by_category", "recent_transactions"]);
  expect(home.widgets.slice(1).map((w) => w.data)).toEqual([[], [], [], expect.objectContaining({ rows: [] }), []]);
});

it("isolates users", async () => {
  await ownerPlan(t.db, A, checking.id, savings.id);
  const a = await ensureHomeDashboard(t.db, A);
  const b = await ensureHomeDashboard(t.db, B);
  expect(b.dashboardId).not.toBe(a.dashboardId);
  expect(b.widgets[0]!.type).toBe("needs_attention");
  expect(b.widgets.some((w) => a.widgets.some((x) => x.id === w.id))).toBe(false);
});
