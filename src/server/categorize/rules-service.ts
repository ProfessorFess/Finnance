import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import {
  activityLog,
  categories,
  categoryRules,
  type RuleMatchType,
  type RuleOrigin,
  transactions,
  userSettings,
} from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { listCategories } from "@/server/finance/categories";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import { DEFAULT_RULES, matchRule, type RuleLike } from "./rules";

export type RuleRow = RuleLike & { userId: string; categoryName: string };

const toRule = (r: typeof categoryRules.$inferSelect): RuleLike & { userId: string } => ({
  id: r.id,
  userId: r.userId,
  matchType: r.matchType,
  pattern: r.pattern,
  categoryId: r.categoryId,
  priority: r.priority,
  createdFrom: r.createdFrom,
  createdAt: r.createdAt,
});

/** Seeds the built-in rules the first time only, so deleting one sticks. */
export async function ensureDefaultRules(db: Database, userId: string): Promise<void> {
  await db.insert(userSettings).values({ userId }).onConflictDoNothing();
  const [s] = await db.select({ seeded: userSettings.defaultRulesSeeded }).from(userSettings).where(eq(userSettings.userId, userId));
  if (s?.seeded) return;
  const byName = new Map((await listCategories(db, userId)).map((c) => [c.name, c.id]));
  const values = DEFAULT_RULES.filter((r) => byName.has(r.category)).map((r) => ({
    userId,
    matchType: r.matchType,
    pattern: r.pattern,
    categoryId: byName.get(r.category)!,
    priority: r.priority,
    createdFrom: "default" as const,
  }));
  await db.transaction(async (tx) => {
    if (values.length) await tx.insert(categoryRules).values(values).onConflictDoNothing();
    await tx.update(userSettings).set({ defaultRulesSeeded: true }).where(eq(userSettings.userId, userId));
  });
}

/** All of the user's rules with category names (seeding built-ins first). */
export async function listRules(db: Database, userId: string): Promise<RuleRow[]> {
  await ensureDefaultRules(db, userId);
  const rows = await db
    .select({ rule: categoryRules, categoryName: categories.name })
    .from(categoryRules)
    .innerJoin(categories, eq(categories.id, categoryRules.categoryId))
    .where(eq(categoryRules.userId, userId))
    .orderBy(desc(categoryRules.priority), desc(categoryRules.createdAt));
  return rows.map((r) => ({ ...toRule(r.rule), categoryName: r.categoryName }));
}

/** Rules as the matcher needs them (no category names). */
export async function loadRules(db: Database, userId: string): Promise<RuleLike[]> {
  await ensureDefaultRules(db, userId);
  return (await db.select().from(categoryRules).where(eq(categoryRules.userId, userId))).map(toRule);
}

/** Adds a rule; the same match type + pattern updates the existing rule's category. */
export async function createRule(
  db: Database,
  userId: string,
  input: { matchType: RuleMatchType; pattern: string; categoryId: string; createdFrom: Exclude<RuleOrigin, "default">; priority?: number },
): Promise<RuleLike> {
  const trimmed = input.pattern.trim();
  if (!trimmed) throw new ValidationError("Enter a pattern for the rule");
  const pattern = input.matchType === "regex" ? trimmed : trimmed.toLowerCase();
  if (input.matchType === "regex") {
    try {
      new RegExp(pattern, "i");
    } catch {
      throw new ValidationError("That pattern isn't a valid regular expression");
    }
  }
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, input.categoryId), eq(categories.userId, userId)));
  if (!cat) throw new NotFoundError("Category");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(categoryRules)
      .values({
        userId,
        matchType: input.matchType,
        pattern,
        categoryId: input.categoryId,
        priority: input.priority ?? 100,
        createdFrom: input.createdFrom,
      })
      .onConflictDoUpdate({
        target: [categoryRules.userId, categoryRules.matchType, categoryRules.pattern],
        set: { categoryId: input.categoryId, createdFrom: input.createdFrom, priority: input.priority ?? 100 },
      })
      .returning();
    await logActivity(tx, { userId, actor: "user", action: "rule.create", entityType: "rule", entityId: row!.id, after: row });
    return toRule(row!);
  });
}

export async function deleteRule(db: Database, userId: string, id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.userId, userId)));
  if (!row) throw new NotFoundError("Rule");
  await db.transaction(async (tx) => {
    await tx.delete(categoryRules).where(and(eq(categoryRules.id, id), eq(categoryRules.userId, userId)));
    await logActivity(tx, { userId, actor: "user", action: "rule.delete", entityType: "rule", entityId: id, before: row });
  });
}

/**
 * Re-labels rows the rule matches, except the user's own choices, transfers,
 * and hidden rows. Returns how many changed.
 */
export async function applyRuleToExisting(db: Database, userId: string, ruleId: string): Promise<number> {
  const [row] = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, ruleId), eq(categoryRules.userId, userId)));
  if (!row) throw new NotFoundError("Rule");
  const rule = toRule(row);

  const candidates = await db
    .select({ id: transactions.id, merchant: transactions.merchant, description: transactions.rawDescription, categoryId: transactions.categoryId })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        ne(transactions.status, "excluded"),
        or(isNull(transactions.transferPairId), eq(transactions.transferPairId, "none")),
        or(isNull(transactions.categorizationSource), inArray(transactions.categorizationSource, ["rule", "history", "ai"])),
      ),
    );
  const hits = candidates.filter((c) => matchRule([rule], { merchant: c.merchant, description: c.description }));
  if (hits.length === 0) return 0;

  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({ categoryId: rule.categoryId, categorizationSource: "rule", categorizationConfidence: null, needsReview: false })
      .where(and(eq(transactions.userId, userId), inArray(transactions.id, hits.map((h) => h.id))));
    await tx.insert(activityLog).values(
      hits.map((h) => ({
        userId,
        actor: "system" as const,
        action: "transaction.auto_categorize",
        entityType: "transaction",
        entityId: h.id,
        before: { categoryId: h.categoryId },
        after: { categoryId: rule.categoryId, source: "rule", ruleId },
      })),
    );
  });
  return hits.length;
}
