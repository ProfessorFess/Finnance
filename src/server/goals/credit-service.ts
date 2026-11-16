/**
 * Goals credit themselves from real money: transfers into a goal's account,
 * or spending in a goal's category. A transaction counts toward one goal at
 * most (the highest-priority active one it fits), and the user's choices
 * ("doesn't count", a hand link) are never undone by automation.
 */
import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { activityLog, goalContributions, goals, NOT_A_TRANSFER, transactions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { NotFoundError } from "@/server/finance/errors";

type Goal = typeof goals.$inferSelect;
type Candidate = { id: string; date: string; amountCents: number; accountId: string; categoryId: string | null; pairId: string | null };

const isTransfer = (c: Candidate) => c.pairId !== null && c.pairId !== NOT_A_TRANSFER;

/** How much a transaction adds to a goal, or null when it doesn't fit the goal's automatic counting. */
function fit(goal: Goal, c: Candidate): number | null {
  if (c.date < goal.startDate) return null;
  if (goal.trackAccountId && c.accountId === goal.trackAccountId && isTransfer(c) && c.amountCents > 0) return c.amountCents;
  if (goal.trackCategoryId && c.categoryId === goal.trackCategoryId && c.amountCents < 0) return -c.amountCents;
  return null;
}

async function trackingGoals(db: Database, userId: string): Promise<Goal[]> {
  return db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.status, "active"), or(sql`${goals.trackAccountId} is not null`, sql`${goals.trackCategoryId} is not null`)))
    .orderBy(asc(goals.priority), asc(goals.createdAt));
}

/** Credits every matching transaction that isn't counted yet. Returns how many were credited. */
export async function creditGoals(db: Database, userId: string): Promise<number> {
  const active = await trackingGoals(db, userId);
  if (active.length === 0) return 0;
  const earliest = active.reduce((min, g) => (g.startDate < min ? g.startDate : min), active[0]!.startDate);
  const accountIds = active.flatMap((g) => (g.trackAccountId ? [g.trackAccountId] : []));
  const categoryIds = active.flatMap((g) => (g.trackCategoryId ? [g.trackCategoryId] : []));
  const fits = [
    ...(accountIds.length ? [inArray(transactions.accountId, accountIds)] : []),
    ...(categoryIds.length ? [inArray(transactions.categoryId, categoryIds)] : []),
  ];
  const candidates: Candidate[] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountCents: transactions.amountCents,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
      pairId: transactions.transferPairId,
    })
    .from(transactions)
    .leftJoin(goalContributions, eq(goalContributions.transactionId, transactions.id))
    .where(and(eq(transactions.userId, userId), ne(transactions.status, "excluded"), gte(transactions.date, earliest), isNull(goalContributions.id), or(...fits)))
    .orderBy(asc(transactions.date), asc(transactions.id));

  let credited = 0;
  await db.transaction(async (tx) => {
    for (const c of candidates) {
      for (const g of active) {
        const amount = fit(g, c);
        if (amount === null) continue;
        const inserted = await tx
          .insert(goalContributions)
          .values({ userId, goalId: g.id, date: c.date, amountCents: amount, transactionId: c.id, source: "auto" })
          .onConflictDoNothing({ target: goalContributions.transactionId })
          .returning({ id: goalContributions.id });
        if (inserted.length) {
          credited++;
          await tx.insert(activityLog).values({ userId, actor: "system", action: "goal_contribution.auto", entityType: "goal", entityId: g.id, after: { transactionId: c.id, amountCents: amount } });
        }
        break;
      }
    }
  });
  return credited;
}

/** Re-credits one goal from scratch after its settings changed: drops its automatic credits (not the user's choices), then credits again. */
export async function regoal(db: Database, userId: string, goalId: string): Promise<number> {
  await db
    .delete(goalContributions)
    .where(and(eq(goalContributions.userId, userId), eq(goalContributions.goalId, goalId), eq(goalContributions.source, "auto"), eq(goalContributions.excluded, false)));
  return creditGoals(db, userId);
}

async function ownTransaction(db: Database, userId: string, id: string): Promise<Candidate> {
  const [row] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountCents: transactions.amountCents,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
      pairId: transactions.transferPairId,
    })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  if (!row) throw new NotFoundError("Transaction");
  return row;
}

/**
 * The user ties a transaction to a goal by hand, or says it doesn't count
 * toward any goal (`goalId` null). Automation never changes either choice.
 */
export async function linkTransactionToGoal(db: Database, userId: string, transactionId: string, goalId: string | null): Promise<void> {
  const row = await ownTransaction(db, userId, transactionId);
  if (goalId) {
    const [g] = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
    if (!g) throw new NotFoundError("Goal");
  }
  const [existing] = await db.select().from(goalContributions).where(and(eq(goalContributions.transactionId, row.id), eq(goalContributions.userId, userId)));
  await db.transaction(async (tx) => {
    if (goalId) {
      if (existing) await tx.delete(goalContributions).where(eq(goalContributions.id, existing.id));
      await tx.insert(goalContributions).values({ userId, goalId, date: row.date, amountCents: Math.abs(row.amountCents), transactionId: row.id, source: "linked" });
    } else if (existing) {
      await tx.update(goalContributions).set({ excluded: true }).where(eq(goalContributions.id, existing.id));
    } else {
      // Nothing counted it yet: block the goal that would have, so automation leaves it alone.
      const wouldTake = (await trackingGoals(tx as unknown as Database, userId)).find((g) => fit(g, row) !== null);
      if (wouldTake) {
        await tx.insert(goalContributions).values({ userId, goalId: wouldTake.id, date: row.date, amountCents: 0, transactionId: row.id, source: "auto", excluded: true });
      }
    }
    await logActivity(tx, { userId, actor: "user", action: "goal_contribution.link", entityType: "transaction", entityId: row.id, before: existing ?? null, after: { goalId } });
  });
}

/** "Doesn't count" / "Count it" on one contribution. Removing a hand-added one deletes it. */
export async function setContributionCounted(db: Database, userId: string, contributionId: string, counted: boolean): Promise<void> {
  const [c] = await db.select().from(goalContributions).where(and(eq(goalContributions.id, contributionId), eq(goalContributions.userId, userId)));
  if (!c) throw new NotFoundError("Contribution");
  await db.transaction(async (tx) => {
    if (c.source === "manual" && !counted) await tx.delete(goalContributions).where(eq(goalContributions.id, c.id));
    else await tx.update(goalContributions).set({ excluded: !counted }).where(eq(goalContributions.id, c.id));
    await logActivity(tx, { userId, actor: "user", action: counted ? "goal_contribution.count" : "goal_contribution.exclude", entityType: "goal", entityId: c.goalId, before: c, after: { counted } });
  });
}
