import { and, eq, gte, isNull, ne, or } from "drizzle-orm";
import { accounts, categories, NOT_A_TRANSFER, recurringDismissals, transactions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { getTrackingStartDate } from "@/server/finance/settings";
import { detectRecurring, type Suggestion } from "./detect";
import { listIncomeSources, listRecurringRules } from "./items-service";
import { matchesPattern } from "./match";

export type SuggestionView = Suggestion & { kindGuess: "income" | "bill" | "subscription"; accountName: string; categoryName: string | null };

const SUBSCRIPTION_CATEGORIES = new Set(["Subscriptions", "Entertainment"]);

/** "Looks like Netflix, $15.49 monthly. Track it?" for repeats the user hasn't tracked or dismissed. */
export async function listSuggestions(db: Database, userId: string, limit = 5): Promise<SuggestionView[]> {
  const startDate = await getTrackingStartDate(db, userId);
  if (!startDate) return [];
  const rows = await db
    .select({
      date: transactions.date,
      amountCents: transactions.amountCents,
      merchant: transactions.merchant,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        ne(transactions.status, "excluded"),
        gte(transactions.date, startDate),
        or(isNull(transactions.transferPairId), eq(transactions.transferPairId, NOT_A_TRANSFER)),
        isNull(transactions.incomeSourceId),
        isNull(transactions.recurringRuleId),
      ),
    );
  if (rows.length === 0) return [];
  const dataThrough = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0]!.date);

  const [income, rules, dismissed, accountRows, categoryRows] = await Promise.all([
    listIncomeSources(db, userId),
    listRecurringRules(db, userId),
    db.select({ key: recurringDismissals.merchantKey }).from(recurringDismissals).where(eq(recurringDismissals.userId, userId)),
    db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.userId, userId)),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, userId)),
  ]);
  const patterns = [...income, ...rules].map((i) => i.matchPattern);
  const dismissedKeys = new Set(dismissed.map((d) => d.key));
  const accountName = new Map(accountRows.map((a) => [a.id, a.name]));
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));

  return detectRecurring(rows, dataThrough)
    .filter((s) => !dismissedKeys.has(s.merchantKey) && !patterns.some((p) => matchesPattern(p, { description: s.merchant, merchant: s.merchant })))
    .slice(0, limit)
    .map((s) => {
      const category = s.categoryId ? (categoryName.get(s.categoryId) ?? null) : null;
      const kindGuess = s.direction === "in" ? "income" : category && SUBSCRIPTION_CATEGORIES.has(category) ? "subscription" : "bill";
      return { ...s, kindGuess, accountName: accountName.get(s.accountId) ?? "", categoryName: category };
    });
}

/** "Don't suggest this again." */
export async function dismissSuggestion(db: Database, userId: string, merchantKey: string): Promise<void> {
  const key = merchantKey.trim().toLowerCase();
  if (!key) return;
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(recurringDismissals)
      .values({ userId, merchantKey: key })
      .onConflictDoNothing({ target: [recurringDismissals.userId, recurringDismissals.merchantKey] })
      .returning({ id: recurringDismissals.id });
    if (inserted[0]) {
      await logActivity(tx, { userId, actor: "user", action: "recurring_suggestion.dismiss", entityType: "recurring_dismissal", entityId: inserted[0].id, after: { merchantKey: key } });
    }
  });
}
