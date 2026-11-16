import { and, desc, eq } from "drizzle-orm";
import { todayInTimeZone } from "@/lib/dates";
import { accounts, categories, goalContributions, transactions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { getSettings } from "@/server/finance/settings";
import { getPlanStatus } from "@/server/plan/status-service";
import { type Goal, type GoalContribution, listGoals } from "./goals-service";
import { type Projection, projectGoal } from "./projection";

export type GoalView = Goal & {
  projection: Projection;
  plannedMonthlyCents: number | null;
  plannedBasis: "set" | "bucket" | null;
  trackLabel: string | null;
  fundedByBucketName: string | null;
  recent: (GoalContribution & { counted: boolean })[];
  /** When this goal is reached but still active: the next goal that would get its money. */
  rollOverTo: string | null;
  /** Reached and still active: ask whether to mark it done. */
  askDone: boolean;
};

export type GoalsOverview = { today: string; goals: GoalView[]; archived: GoalView[]; totalSavedCents: number };

const sameSource = (a: Goal, b: Goal) =>
  (a.trackAccountId !== null && a.trackAccountId === b.trackAccountId) || (a.trackCategoryId !== null && a.trackCategoryId === b.trackCategoryId);

/** Every goal with its progress, projection, and where its money comes from, in priority order. */
export async function getGoalsOverview(db: Database, userId: string, now: Date = new Date()): Promise<GoalsOverview> {
  const settings = await getSettings(db, userId);
  const today = todayInTimeZone(settings.timezone, now);
  const list = await listGoals(db, userId);
  if (list.length === 0) return { today, goals: [], archived: [], totalSavedCents: 0 };

  const [contributionRows, accountRows, categoryRows] = await Promise.all([
    db
      .select({ c: goalContributions, status: transactions.status })
      .from(goalContributions)
      .leftJoin(transactions, eq(transactions.id, goalContributions.transactionId))
      .where(eq(goalContributions.userId, userId))
      .orderBy(desc(goalContributions.date), desc(goalContributions.createdAt)),
    db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.userId, userId)),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.userId, userId))),
  ]);
  const contributions = contributionRows.map(({ c, status }) => ({ ...c, counted: !c.excluded && status !== "excluded" }));
  const accountName = new Map(accountRows.map((a) => [a.id, a.name]));
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));

  // Planned amounts per income, or from a funding bucket, need the plan.
  const needsPlan = list.some((g) => g.plannedPer === "income" || g.fundedByBucketId);
  const plan = needsPlan ? await getPlanStatus(db, userId, now) : null;
  const bucketById = new Map((plan?.buckets ?? []).map((b) => [b.id, b]));

  const views: GoalView[] = list.map((g) => {
    let plannedMonthlyCents: number | null = null;
    let plannedBasis: GoalView["plannedBasis"] = null;
    if (g.plannedCents !== null) {
      plannedMonthlyCents = g.plannedPer === "income" ? Math.round(g.plannedCents * (plan?.incomesPerMonth ?? 1)) : g.plannedCents;
      plannedBasis = "set";
    } else if (g.fundedByBucketId && bucketById.get(g.fundedByBucketId)?.monthlyCents) {
      plannedMonthlyCents = bucketById.get(g.fundedByBucketId)!.monthlyCents;
      plannedBasis = "bucket";
    }
    const mine = contributions.filter((c) => c.goalId === g.id);
    const projection = projectGoal({
      targetCents: g.targetCents,
      targetDate: g.targetDate,
      startingCents: g.startingCents,
      contributions: mine.filter((c) => c.counted).map((c) => ({ date: c.date, amountCents: c.amountCents })),
      plannedMonthlyCents,
      completed: g.status === "completed",
      today,
    });
    return {
      ...g,
      projection: g.status === "paused" ? { ...projection, chip: null } : projection,
      plannedMonthlyCents,
      plannedBasis,
      trackLabel: g.trackAccountId
        ? `Moves into ${accountName.get(g.trackAccountId) ?? "an account"}`
        : g.trackCategoryId
          ? `Spending in ${categoryName.get(g.trackCategoryId) ?? "a category"}`
          : null,
      fundedByBucketName: g.fundedByBucketId ? (bucketById.get(g.fundedByBucketId)?.name ?? null) : null,
      recent: mine.slice(0, 10),
      rollOverTo: null,
      askDone: false,
    };
  });

  // A reached, still-active goal asks before its money rolls to the next goal with the same source.
  for (const v of views) {
    if (!v.projection.reached || v.status !== "active") continue;
    v.askDone = true;
    const next = views.find((o) => o.id !== v.id && o.status === "active" && o.priority > v.priority && sameSource(o, v));
    v.rollOverTo = next?.name ?? null;
  }

  const shown = views.filter((v) => v.status !== "archived");
  return {
    today,
    goals: shown,
    archived: views.filter((v) => v.status === "archived"),
    totalSavedCents: views.filter((v) => (v.status === "active" || v.status === "completed") && v.type !== "debt_payoff").reduce((s, v) => s + v.projection.progressCents, 0),
  };
}
