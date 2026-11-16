import { and, count, eq, isNull } from "drizzle-orm";
import { accounts, budgetPlans, goals, incomeSources, recurringRules, userSettings } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { getSettings } from "@/server/finance/settings";

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

/** Common subscriptions with typical US prices; amounts are editable before they're added. */
export const COMMON_SUBSCRIPTIONS: { name: string; cents: number; matchPattern: string }[] = [
  { name: "Netflix", cents: 1549, matchPattern: "Netflix" },
  { name: "Spotify", cents: 1199, matchPattern: "Spotify" },
  { name: "Hulu", cents: 999, matchPattern: "Hulu" },
  { name: "Disney+", cents: 1599, matchPattern: "Disney" },
  { name: "YouTube Premium", cents: 1399, matchPattern: "YouTube" },
  { name: "Amazon Prime", cents: 1499, matchPattern: "Amazon Prime" },
  { name: "Apple iCloud+", cents: 299, matchPattern: "Apple.com/bill" },
  { name: "Max", cents: 1699, matchPattern: "Max.com" },
  { name: "Peacock", cents: 799, matchPattern: "Peacock" },
  { name: "Paramount+", cents: 799, matchPattern: "Paramount" },
];

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
