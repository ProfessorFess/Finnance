import { and, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { addDays, addMonths, formatDisplayDate, monthWindow, todayInTimeZone } from "@/lib/dates";
import { categories, NOT_A_TRANSFER, transactions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { countUnsorted } from "@/server/categorize/pipeline";
import { getSettings } from "@/server/finance/settings";
import { countNeedsReview, HIDDEN_STATUS } from "@/server/finance/transactions";
import { getGoalsOverview } from "@/server/goals/overview";
import { getPlanStatus } from "@/server/plan/status-service";
import { getRecurringOverview } from "@/server/recurring/overview";
import { listSuggestions } from "@/server/recurring/suggestions-service";

export type SpendingRow = { categoryId: string | null; name: string; cents: number };
export type SpendingByCategory = { month: string; firstMonth: boolean; totalCents: number; previousTotalCents: number | null; rows: SpendingRow[] };
export type UpcomingItem = { kind: "income" | "bill" | "subscription" | "transfer"; name: string; date: string; amountCents: number | null };
export type AttentionItem = { key: string; text: string; href: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Real spending per category between two dates: expense-category rows (refunds net out) and
 * uncategorized money out. Transfers, transfer- or income-kind categories, and hidden rows don't count.
 */
async function spendingBetween(db: Database, userId: string, from: string, to: string): Promise<SpendingRow[]> {
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      name: categories.name,
      cents: sql<number>`(-sum(${transactions.amountCents}))::bigint`.mapWith(Number),
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, from),
        lte(transactions.date, to),
        ne(transactions.status, HIDDEN_STATUS),
        or(isNull(transactions.transferPairId), eq(transactions.transferPairId, NOT_A_TRANSFER)),
        or(eq(categories.kind, "expense"), and(isNull(transactions.categoryId), sql`${transactions.amountCents} < 0`)),
      ),
    )
    .groupBy(transactions.categoryId, categories.name);
  return rows
    .map((r) => ({ categoryId: r.categoryId, name: r.name ?? "Uncategorized", cents: r.cents }))
    .filter((r) => r.cents > 0)
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
}

/** This calendar month's spending by category, with last month's total once a full month of tracking exists. */
export async function getSpendingByCategory(db: Database, userId: string, now: Date = new Date()): Promise<SpendingByCategory> {
  const settings = await getSettings(db, userId);
  const today = todayInTimeZone(settings.timezone, now);
  const { start, end } = monthWindow(today);
  const startDate = settings.trackingStartDate;
  const from = startDate && startDate > start ? startDate : start;
  const rows = startDate ? await spendingBetween(db, userId, from, end) : [];
  const prev = monthWindow(addMonths(start, -1));
  // A comparison needs all of last month tracked.
  const firstMonth = !startDate || startDate > prev.start;
  const previousTotalCents = firstMonth ? null : (await spendingBetween(db, userId, prev.start, prev.end)).reduce((s, r) => s + r.cents, 0);
  return { month: today.slice(0, 7), firstMonth, totalCents: rows.reduce((s, r) => s + r.cents, 0), previousTotalCents, rows };
}

/** Active income and bills expected in the next `days` days, soonest first. */
export async function getUpcoming(db: Database, userId: string, now: Date = new Date(), days = 14): Promise<UpcomingItem[]> {
  const o = await getRecurringOverview(db, userId, now);
  const until = addDays(o.today, days);
  return [...o.income, ...o.bills]
    .filter((i) => i.state !== "paused" && i.nextDate !== null && i.nextDate >= o.today && i.nextDate <= until)
    .map((i) => ({ kind: i.kind, name: i.name, date: i.nextDate!, amountCents: i.amountCents }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** Everything that wants a look, each with where to go. */
export async function getNeedsAttention(db: Database, userId: string, now: Date = new Date()): Promise<AttentionItem[]> {
  const [review, unsorted, recurring, suggestions, goals, plan] = await Promise.all([
    countNeedsReview(db, userId),
    countUnsorted(db, userId),
    getRecurringOverview(db, userId, now),
    listSuggestions(db, userId),
    getGoalsOverview(db, userId, now),
    getPlanStatus(db, userId, now),
  ]);
  const items: AttentionItem[] = [];
  if (review) items.push({ key: "review", text: `${plural(review, "transaction needs", "transactions need")} a look`, href: "/transactions/review" });
  if (unsorted)
    items.push({ key: "unsorted", text: `${plural(unsorted, "transaction hasn't", "transactions haven't")} been sorted yet`, href: "/transactions/review" });
  const all = [...recurring.income, ...recurring.bills];
  for (const i of all) {
    const last = i.lateDates.at(-1);
    if (last) items.push({ key: "late", text: `${i.name} is late (expected ${formatDisplayDate(last)})`, href: "/recurring" });
  }
  const awaiting = all.reduce((n, i) => n + i.awaitingDates.length, 0);
  if (awaiting)
    items.push({ key: "awaiting", text: `Import your latest files — ${plural(awaiting, "expected item isn't", "expected items aren't")} in yet`, href: "/import" });
  if (suggestions.length)
    items.push({ key: "suggestions", text: `${plural(suggestions.length, "repeating charge", "repeating charges")} you might want to track`, href: "/recurring" });
  for (const g of goals.goals) if (g.askDone) items.push({ key: "goal_done", text: `${g.name} reached its target`, href: "/goals" });
  if (plan?.problem === "no_income") items.push({ key: "plan", text: "Your plan has no income", href: "/plan" });
  return items;
}
