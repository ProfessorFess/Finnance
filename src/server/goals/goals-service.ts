import { and, asc, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { parseDateValue, todayInTimeZone } from "@/lib/dates";
import { accounts, categories, type GoalStatus, type GoalType, goalContributions, goals, transactions } from "@/server/db/schema";
import type { Database, Executor } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import { getSettings } from "@/server/finance/settings";
import { assertBucket } from "@/server/plan/plans-service";
import { creditGoals, regoal } from "./credit-service";

export type Goal = typeof goals.$inferSelect;
export type GoalContribution = typeof goalContributions.$inferSelect;

export const goalInputSchema = z.object({
  name: z.string().max(200),
  type: z.enum(["savings", "debt_payoff", "purchase", "retirement"]),
  icon: z.string().min(1).max(40).optional(),
  targetCents: z.number().int().nullable(),
  targetDate: z.string().nullable(),
  startingCents: z.number().int(),
  startDate: z.string().optional(),
  plannedCents: z.number().int().nullable(),
  plannedPer: z.enum(["month", "income"]).nullable(),
  fundedByBucketId: z.string().nullable(),
  trackAccountId: z.string().nullable(),
  trackCategoryId: z.string().nullable(),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

const ICONS: Record<GoalType, string> = { savings: "piggy-bank", debt_payoff: "landmark", purchase: "shopping-bag", retirement: "sunset" };

const validDate = (d: string) => parseDateValue(d, "YYYY-MM-DD") === d;

async function defaultStartDate(db: Executor, userId: string): Promise<string> {
  const s = await getSettings(db as Database, userId);
  return s.trackingStartDate ?? todayInTimeZone(s.timezone);
}

async function cleanGoal(db: Executor, userId: string, input: GoalInput) {
  const g = goalInputSchema.parse(input);
  const name = g.name.trim();
  if (!name || name.length > 80) throw new ValidationError("Give it a name");
  if (g.targetCents !== null && g.targetCents <= 0) throw new ValidationError("Enter a target above $0");
  if (g.targetDate !== null && !validDate(g.targetDate)) throw new ValidationError("Enter a valid date");
  if (g.startDate !== undefined && !validDate(g.startDate)) throw new ValidationError("Enter a valid date");
  if (g.startingCents < 0) throw new ValidationError("Enter what's already saved as $0 or more");
  if (g.plannedCents !== null && (g.plannedCents <= 0 || g.plannedPer === null)) throw new ValidationError("Enter a planned amount above $0");
  if (g.trackAccountId && g.trackCategoryId) throw new ValidationError("Choose one way to count it automatically");
  if (g.fundedByBucketId) await assertBucket(db, userId, g.fundedByBucketId);
  if (g.trackAccountId) {
    const [a] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, g.trackAccountId), eq(accounts.userId, userId)));
    if (!a) throw new NotFoundError("Account");
  }
  if (g.trackCategoryId) {
    const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, g.trackCategoryId), eq(categories.userId, userId)));
    if (!c) throw new NotFoundError("Category");
  }
  return {
    name,
    type: g.type,
    icon: g.icon ?? ICONS[g.type],
    targetCents: g.targetCents,
    targetDate: g.targetDate,
    startingCents: g.startingCents,
    plannedCents: g.plannedCents,
    plannedPer: g.plannedCents !== null ? g.plannedPer : null,
    fundedByBucketId: g.fundedByBucketId,
    trackAccountId: g.trackAccountId,
    trackCategoryId: g.trackCategoryId,
    ...(g.startDate ? { startDate: g.startDate } : {}),
  };
}

async function getGoal(db: Executor, userId: string, id: string): Promise<Goal> {
  const [g] = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)));
  if (!g) throw new NotFoundError("Goal");
  return g;
}

/** After a goal's counting rules change, its automatic credits are rebuilt. */
const afterGoalChange = (db: Database, userId: string, goalId: string) => regoal(db, userId, goalId);
/** After its status or order changes, history stays put; only uncounted money is credited. */
const afterGoalMove = (db: Database, userId: string) => creditGoals(db, userId);

export async function listGoals(db: Database, userId: string): Promise<Goal[]> {
  return db.select().from(goals).where(eq(goals.userId, userId)).orderBy(asc(goals.priority), asc(goals.createdAt));
}

export async function createGoal(db: Database, userId: string, input: GoalInput): Promise<Goal> {
  const values = await cleanGoal(db, userId, input);
  const startDate = values.startDate ?? (await defaultStartDate(db, userId));
  const created = await db.transaction(async (tx) => {
    const [{ top }] = (await tx.select({ top: max(goals.priority) }).from(goals).where(eq(goals.userId, userId))) as [{ top: number | null }];
    const [g] = await tx
      .insert(goals)
      .values({ ...values, startDate, userId, priority: (top ?? 0) + 1 })
      .returning();
    await logActivity(tx, { userId, actor: "user", action: "goal.create", entityType: "goal", entityId: g!.id, after: g });
    return g!;
  });
  await afterGoalChange(db, userId, created.id);
  return getGoal(db, userId, created.id);
}

export async function updateGoal(db: Database, userId: string, id: string, input: GoalInput): Promise<Goal> {
  const before = await getGoal(db, userId, id);
  const values = await cleanGoal(db, userId, input);
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(goals).set(values).where(and(eq(goals.id, id), eq(goals.userId, userId))).returning();
    await logActivity(tx, { userId, actor: "user", action: "goal.update", entityType: "goal", entityId: id, before, after: updated });
  });
  await afterGoalChange(db, userId, id);
  return getGoal(db, userId, id);
}

export async function deleteGoal(db: Database, userId: string, id: string): Promise<void> {
  const before = await getGoal(db, userId, id);
  await db.transaction(async (tx) => {
    await tx.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)));
    await logActivity(tx, { userId, actor: "user", action: "goal.delete", entityType: "goal", entityId: id, before });
  });
}

/** Swaps a goal with its neighbor in priority order (no-op at the ends). */
export async function moveGoal(db: Database, userId: string, id: string, direction: "up" | "down"): Promise<void> {
  await getGoal(db, userId, id);
  const list = await listGoals(db, userId);
  const i = list.findIndex((g) => g.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return;
  const a = list[i]!;
  const b = list[j]!;
  await db.transaction(async (tx) => {
    // Renumber in list order with the two swapped, so ties can't make the move a no-op.
    const order = list.map((g) => g.id);
    [order[i], order[j]] = [order[j]!, order[i]!];
    for (const [index, goalId] of order.entries()) await tx.update(goals).set({ priority: index + 1 }).where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
    await logActivity(tx, { userId, actor: "user", action: "goal.move", entityType: "goal", entityId: id, before: { priority: a.priority }, after: { swappedWith: b.id, direction } });
  });
  await afterGoalMove(db, userId);
}

export async function setGoalStatus(db: Database, userId: string, id: string, status: GoalStatus): Promise<Goal> {
  const before = await getGoal(db, userId, id);
  z.enum(["active", "paused", "completed", "archived"]).parse(status);
  await db.transaction(async (tx) => {
    await tx
      .update(goals)
      .set({ status, completedAt: status === "completed" ? new Date() : null })
      .where(and(eq(goals.id, id), eq(goals.userId, userId)));
    await logActivity(tx, { userId, actor: "user", action: "goal.status", entityType: "goal", entityId: id, before: { status: before.status }, after: { status } });
  });
  await afterGoalMove(db, userId);
  return getGoal(db, userId, id);
}

/** Money added by hand (negative = a withdrawal). */
export async function addContribution(
  db: Database,
  userId: string,
  goalId: string,
  input: { date: string; amountCents: number; note?: string },
): Promise<GoalContribution> {
  await getGoal(db, userId, goalId);
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0) throw new ValidationError("Enter an amount");
  if (!validDate(input.date)) throw new ValidationError("Enter a valid date");
  return db.transaction(async (tx) => {
    const [c] = await tx
      .insert(goalContributions)
      .values({ userId, goalId, date: input.date, amountCents: input.amountCents, source: "manual", note: input.note?.trim() || null })
      .returning();
    await logActivity(tx, { userId, actor: "user", action: "goal_contribution.create", entityType: "goal", entityId: goalId, after: c });
    return c!;
  });
}

/** A goal's contributions, newest first; `counted` is false when excluded or its transaction is hidden. */
export async function listContributions(db: Database, userId: string, goalId: string, limit = 20): Promise<(GoalContribution & { counted: boolean })[]> {
  await getGoal(db, userId, goalId);
  const rows = await db
    .select({ c: goalContributions, status: transactions.status })
    .from(goalContributions)
    .leftJoin(transactions, eq(transactions.id, goalContributions.transactionId))
    .where(and(eq(goalContributions.goalId, goalId), eq(goalContributions.userId, userId)))
    .orderBy(desc(goalContributions.date), desc(goalContributions.createdAt))
    .limit(limit);
  return rows.map(({ c, status }) => ({ ...c, counted: !c.excluded && status !== "excluded" }));
}
