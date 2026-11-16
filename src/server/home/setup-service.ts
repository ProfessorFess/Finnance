import { and, count, eq, isNull } from "drizzle-orm";
import { accounts, budgetPlans, goals, incomeSources, recurringRules, userSettings } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { monthWindow, todayInTimeZone } from "@/lib/dates";
import { ValidationError } from "@/server/finance/errors";
import { getSettings } from "@/server/finance/settings";
import { createRecurringRule } from "@/server/recurring/items-service";

export type SetupStepKey = "start_date" | "accounts" | "income" | "plan" | "bills" | "goals";

export type SetupStep = { key: SetupStepKey; title: string; done: boolean; skipped: boolean; href: string };
export type SetupStatus = { steps: SetupStep[]; complete: boolean; nextStep: SetupStepKey | null };

export const SETUP_STEPS: { key: SetupStepKey; title: string }[] = [
  { key: "start_date", title: "Choose your start date" },
  { key: "accounts", title: "Add your accounts" },
  { key: "income", title: "Add your income" },
  { key: "plan", title: "Make your plan" },
  { key: "bills", title: "Add bills and subscriptions" },
  { key: "goals", title: "Add your goals" },
];

export { COMMON_SUBSCRIPTIONS } from "./common-subscriptions";

async function has(q: Promise<{ n: number }[]>): Promise<boolean> {
  const [row] = await q;
  return (row?.n ?? 0) > 0;
}

async function skippedSteps(db: Database, userId: string): Promise<SetupStepKey[]> {
  const [row] = await db.select({ s: userSettings.setupSkipped }).from(userSettings).where(eq(userSettings.userId, userId));
  return (row?.s ?? []) as SetupStepKey[];
}

/** Which first-run steps are done, read from the user's records (done = the thing exists), plus what they skipped. */
export async function getSetupStatus(db: Database, userId: string): Promise<SetupStatus> {
  const settings = await getSettings(db, userId);
  const [skipped, hasAccounts, hasIncome, hasPlan, hasBills, hasGoals] = await Promise.all([
    skippedSteps(db, userId),
    has(db.select({ n: count() }).from(accounts).where(and(eq(accounts.userId, userId), isNull(accounts.archivedAt)))),
    has(db.select({ n: count() }).from(incomeSources).where(eq(incomeSources.userId, userId))),
    has(db.select({ n: count() }).from(budgetPlans).where(and(eq(budgetPlans.userId, userId), eq(budgetPlans.active, true)))),
    has(db.select({ n: count() }).from(recurringRules).where(eq(recurringRules.userId, userId))),
    has(db.select({ n: count() }).from(goals).where(eq(goals.userId, userId))),
  ]);
  const done: Record<SetupStepKey, boolean> = {
    start_date: settings.trackingStartDate !== null,
    accounts: hasAccounts,
    income: hasIncome,
    plan: hasPlan,
    bills: hasBills,
    goals: hasGoals,
  };
  const steps = SETUP_STEPS.map((s) => ({ ...s, done: done[s.key], skipped: skipped.includes(s.key), href: `/setup?step=${s.key}` }));
  const next = steps.find((s) => !s.done && !s.skipped);
  return { steps, complete: !next, nextStep: next?.key ?? null };
}

async function setSkipped(db: Database, userId: string, key: SetupStepKey, skip: boolean): Promise<void> {
  await getSettings(db, userId);
  const before = await skippedSteps(db, userId);
  const after = skip ? [...new Set([...before, key])] : before.filter((k) => k !== key);
  if (after.length === before.length) return;
  await db.transaction(async (tx) => {
    await tx.update(userSettings).set({ setupSkipped: after }).where(eq(userSettings.userId, userId));
    await logActivity(tx, { userId, actor: "user", action: skip ? "setup.skip" : "setup.unskip", entityType: "settings", entityId: userId, before, after });
  });
}

/** Skips a setup step (it still shows done once its records exist). */
export const skipSetupStep = (db: Database, userId: string, key: SetupStepKey) => setSkipped(db, userId, key, true);
/** Puts a skipped step back on the list. */
export const unskipSetupStep = (db: Database, userId: string, key: SetupStepKey) => setSkipped(db, userId, key, false);

export type PickedSubscription = { name: string; cents: number; matchPattern: string; /** Day of the month it bills (1–31). */ day: number };

/**
 * Adds the subscriptions picked from the common list as monthly items (paid from the plan's bills bucket, if any),
 * each first expected on its billing day this month, so matching looks around the right date.
 */
export async function addCommonSubscriptions(db: Database, userId: string, items: PickedSubscription[], now: Date = new Date()): Promise<number> {
  for (const i of items) {
    if (!Number.isInteger(i.cents) || i.cents <= 0) throw new ValidationError(`Enter an amount for ${i.name}`);
    if (!Number.isInteger(i.day) || i.day < 1 || i.day > 31) throw new ValidationError(`Enter the day ${i.name} bills`);
  }
  const { timezone } = await getSettings(db, userId);
  const { start, end } = monthWindow(todayInTimeZone(timezone, now));
  const lastDay = Number(end.slice(8, 10));
  for (const i of items) {
    await createRecurringRule(db, userId, {
      name: i.name, kind: "subscription", frequency: "monthly", anchorDate: `${start.slice(0, 8)}${String(Math.min(i.day, lastDay)).padStart(2, "0")}`,
      secondDay: null, expectedCents: i.cents, amountVaries: false, toleranceCents: null, accountId: null, categoryId: null, matchPattern: i.matchPattern,
    });
  }
  return items.length;
}
