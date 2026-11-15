import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { recordAiUsage, canSpendAi } from "@/server/ai/usage";
import { activityLog, categories, NOT_A_TRANSFER, transactions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { listCategories } from "@/server/finance/categories";
import type { AiCategorizer, AiExample, AiItem, AiResult } from "./ai-categorizer";
import { normalizeMerchant } from "./normalize-merchant";
import { matchRule } from "./rules";
import { loadRules } from "./rules-service";
import { detectTransfers } from "./transfers-service";

export const AI_CONFIDENCE_THRESHOLD = 0.7;
export const AI_BATCH_SIZE = 50;
export const AI_CONCURRENCY = 3;

export type CategorizeSummary = { byRule: number; byHistory: number; byAi: number; needsReview: number };
export type CategorizeDeps = { ai: AiCategorizer | null; now?: Date };

type Decision = {
  id: string;
  categoryId: string | null;
  source: "rule" | "history" | "ai" | null;
  confidence: number | null;
  needsReview: boolean;
  before: string | null;
};

const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Most recent user-confirmed category per lowercased merchant. */
async function historyFor(db: Database, userId: string, merchants: string[]): Promise<Map<string, string>> {
  if (merchants.length === 0) return new Map();
  const rows = await db
    .select({ merchant: sql<string>`lower(${transactions.merchant})`, categoryId: transactions.categoryId })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.categorizationSource, "user"),
        isNotNull(transactions.categoryId),
        inArray(sql`lower(${transactions.merchant})`, merchants),
      ),
    )
    .orderBy(desc(transactions.updatedAt));
  const map = new Map<string, string>();
  for (const r of rows) if (!map.has(r.merchant) && r.categoryId) map.set(r.merchant, r.categoryId);
  return map;
}

/** The user's 20 most recent choices, one per merchant, as examples for the AI. */
async function examplesFor(db: Database, userId: string): Promise<AiExample[]> {
  const rows = await db
    .select({ merchant: transactions.merchant, categoryName: categories.name })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.userId, userId), eq(transactions.categorizationSource, "user"), isNotNull(transactions.merchant)))
    .orderBy(desc(transactions.updatedAt))
    .limit(200);
  const seen = new Set<string>();
  const out: AiExample[] = [];
  for (const r of rows) {
    const key = r.merchant!.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ merchant: r.merchant!, categoryName: r.categoryName });
    if (out.length === 20) break;
  }
  return out;
}

/**
 * Sorts transactions: the user's rules (and built-ins), then their past choice
 * for the merchant, then the AI. Never touches rows the user categorized,
 * transfers, or hidden rows. Without AI (no key, over the cap, or an error),
 * what's left goes to review.
 */
export async function categorizeTransactions(
  db: Database,
  userId: string,
  scope: { ids: string[] } | { pending: true },
  deps: CategorizeDeps,
): Promise<CategorizeSummary> {
  const conds = [
    eq(transactions.userId, userId),
    ne(transactions.status, "excluded"),
    or(isNull(transactions.transferPairId), eq(transactions.transferPairId, NOT_A_TRANSFER)),
    or(
      isNull(transactions.categorizationSource),
      and(inArray(transactions.categorizationSource, ["ai", "history", "rule"]), eq(transactions.needsReview, true)),
    ),
  ];
  if ("ids" in scope) {
    if (scope.ids.length === 0) return { byRule: 0, byHistory: 0, byAi: 0, needsReview: 0 };
    conds.push(inArray(transactions.id, scope.ids));
  }
  const rows = await db
    .select({
      id: transactions.id,
      merchant: transactions.merchant,
      description: transactions.rawDescription,
      amountCents: transactions.amountCents,
      bankCategory: transactions.bankCategory,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(...conds));
  if (rows.length === 0) return { byRule: 0, byHistory: 0, byAi: 0, needsReview: 0 };

  const rules = await loadRules(db, userId);
  const history = await historyFor(db, userId, [...new Set(rows.map((r) => (r.merchant ?? "").toLowerCase()).filter(Boolean))]);
  const decisions: Decision[] = [];
  const forAi: typeof rows = [];

  for (const r of rows) {
    const rule = matchRule(rules, { merchant: r.merchant, description: r.description });
    if (rule) {
      decisions.push({ id: r.id, categoryId: rule.categoryId, source: "rule", confidence: null, needsReview: false, before: r.categoryId });
      continue;
    }
    const past = r.merchant ? history.get(r.merchant.toLowerCase()) : undefined;
    if (past) {
      decisions.push({ id: r.id, categoryId: past, source: "history", confidence: null, needsReview: false, before: r.categoryId });
      continue;
    }
    forAi.push(r);
  }

  const aiResults = new Map<string, AiResult>();
  if (forAi.length > 0 && deps.ai && (await canSpendAi(db, userId, deps.now ?? new Date()))) {
    const categoryOptions = (await listCategories(db, userId)).map((c) => ({ id: c.id, name: c.name, group: c.groupName, kind: c.kind }));
    const examples = await examplesFor(db, userId);
    const batches = chunk(forAi, AI_BATCH_SIZE);
    for (const group of chunk(batches, AI_CONCURRENCY)) {
      await Promise.all(
        group.map(async (batch) => {
          const items: AiItem[] = batch.map((r) => ({
            ref: r.id,
            merchant: r.merchant ?? r.description,
            description: r.description,
            amountCents: r.amountCents,
            bankCategory: r.bankCategory,
          }));
          try {
            const out = await deps.ai!({ categories: categoryOptions, examples, items });
            if (out.usage) await recordAiUsage(db, userId, { purpose: "categorize", model: out.model, usage: out.usage });
            for (const res of out.results) aiResults.set(res.ref, res);
          } catch (err) {
            // The AI being down must never break sorting; these rows go to review.
            console.error("AI categorization failed", err instanceof Error ? err.message : err);
          }
        }),
      );
    }
  }

  for (const r of forAi) {
    const res = aiResults.get(r.id);
    if (res) {
      const sure = res.categoryId !== null && res.confidence >= AI_CONFIDENCE_THRESHOLD;
      decisions.push({ id: r.id, categoryId: res.categoryId, source: "ai", confidence: res.confidence, needsReview: !sure, before: r.categoryId });
    } else {
      decisions.push({ id: r.id, categoryId: r.categoryId, source: null, confidence: null, needsReview: true, before: r.categoryId });
    }
  }

  await db.transaction(async (tx) => {
    for (const d of decisions) {
      await tx
        .update(transactions)
        .set({ categoryId: d.categoryId, categorizationSource: d.source, categorizationConfidence: d.confidence, needsReview: d.needsReview })
        .where(and(eq(transactions.id, d.id), eq(transactions.userId, userId)));
    }
    const changed = decisions.filter((d) => d.source !== null);
    if (changed.length) {
      await tx.insert(activityLog).values(
        changed.map((d) => ({
          userId,
          actor: "system" as const,
          action: "transaction.auto_categorize",
          entityType: "transaction",
          entityId: d.id,
          before: { categoryId: d.before },
          after: { categoryId: d.categoryId, source: d.source, confidence: d.confidence },
        })),
      );
    }
  });

  return {
    byRule: decisions.filter((d) => d.source === "rule").length,
    byHistory: decisions.filter((d) => d.source === "history").length,
    byAi: decisions.filter((d) => d.source === "ai" && !d.needsReview).length,
    needsReview: decisions.filter((d) => d.needsReview).length,
  };
}

/**
 * Backfill for rows imported before automatic sorting existed: fill missing
 * merchant names, pair transfers, then sort everything still pending.
 */
export async function sortTransactions(
  db: Database,
  userId: string,
  deps: CategorizeDeps,
): Promise<CategorizeSummary & { transfers: number; merchantsFilled: number }> {
  const missing = await db
    .select({ id: transactions.id, description: transactions.rawDescription })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.merchant)));
  if (missing.length) {
    await db.transaction(async (tx) => {
      for (const m of missing) {
        await tx
          .update(transactions)
          .set({ merchant: normalizeMerchant(m.description) })
          .where(and(eq(transactions.id, m.id), eq(transactions.userId, userId)));
      }
    });
  }
  const transfers = await detectTransfers(db, userId);
  const summary = await categorizeTransactions(db, userId, { pending: true }, deps);
  return { ...summary, transfers, merchantsFilled: missing.length };
}

/** Rows Finnance has never tried to sort (imported before automatic sorting existed). */
export async function countUnsorted(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        ne(transactions.status, "excluded"),
        isNull(transactions.transferPairId),
        isNull(transactions.categorizationSource),
        eq(transactions.needsReview, false),
      ),
    );
  return row?.n ?? 0;
}
