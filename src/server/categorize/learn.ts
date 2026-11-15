import { and, eq, sql } from "drizzle-orm";
import { categories, categoryRules, transactions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { NotFoundError } from "@/server/finance/errors";
import { type TransactionRow, updateTransaction } from "@/server/finance/transactions";
import { applyRuleToExisting, createRule } from "./rules-service";

export type Learned =
  | { kind: "suggest"; merchant: string; categoryId: string; categoryName: string }
  | { kind: "ruleCreated"; ruleId: string; merchant: string; categoryName: string; applied: number };

async function categoryName(db: Database, userId: string, categoryId: string): Promise<string> {
  const [c] = await db
    .select({ name: categories.name })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
  if (!c) throw new NotFoundError("Category");
  return c.name;
}

/**
 * The user picks a category for one transaction. It becomes their choice, and
 * Finnance learns from it: the first time for a merchant it offers a rule; the
 * second time it creates the rule itself and applies it to similar rows.
 */
export async function chooseCategory(
  db: Database,
  userId: string,
  transactionId: string,
  categoryId: string | null,
): Promise<{ row: TransactionRow; learned: Learned | null }> {
  const row = await updateTransaction(db, userId, transactionId, { categoryId });
  if (!categoryId || !row.merchant) return { row, learned: null };

  const pattern = row.merchant.toLowerCase();
  const [existing] = await db
    .select({ id: categoryRules.id })
    .from(categoryRules)
    .where(and(eq(categoryRules.userId, userId), eq(categoryRules.matchType, "merchant_equals"), eq(categoryRules.pattern, pattern)));
  if (existing) return { row, learned: null };

  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.categorizationSource, "user"),
        eq(transactions.categoryId, categoryId),
        sql`lower(${transactions.merchant}) = ${pattern}`,
      ),
    )) as [{ n: number }];

  const name = await categoryName(db, userId, categoryId);
  if (n >= 2) {
    const rule = await createRule(db, userId, { matchType: "merchant_equals", pattern, categoryId, createdFrom: "correction" });
    const applied = await applyRuleToExisting(db, userId, rule.id);
    return { row, learned: { kind: "ruleCreated", ruleId: rule.id, merchant: row.merchant, categoryName: name, applied } };
  }
  return { row, learned: { kind: "suggest", merchant: row.merchant, categoryId, categoryName: name } };
}

/** "Always put this merchant in this category": a rule, applied to matching automatic rows. */
export async function alwaysCategorize(
  db: Database,
  userId: string,
  input: { merchant: string; categoryId: string },
): Promise<{ ruleId: string; applied: number }> {
  const rule = await createRule(db, userId, {
    matchType: "merchant_equals",
    pattern: input.merchant,
    categoryId: input.categoryId,
    createdFrom: "user",
  });
  return { ruleId: rule.id, applied: await applyRuleToExisting(db, userId, rule.id) };
}
