import { and, desc, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { todayInTimeZone } from "@/lib/dates";
import { accounts, categories, type RecurringKind, transactions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { getSettings } from "@/server/finance/settings";
import { type IncomeSource, type ItemRef, listIncomeSources, listRecurringRules, type RecurringRule } from "./items-service";
import { type Frequency, monthlyEquivalentCents } from "./schedule";
import { type AmountBasis, type ItemState, itemStatus, planningAmount } from "./status";

export type RecurringItemView = {
  ref: ItemRef;
  name: string;
  kind: "income" | RecurringKind;
  frequency: Frequency;
  amountCents: number | null;
  amountBasis: AmountBasis;
  monthlyCents: number | null;
  state: ItemState;
  nextDate: string | null;
  lateDates: string[];
  awaitingDates: string[];
  lastMatch: { date: string; amountCents: number } | null;
  recentMatches: { transactionId: string; date: string; amountCents: number }[];
  accountName: string | null;
  categoryName: string | null;
  item: IncomeSource | RecurringRule;
};

export type RecurringOverview = {
  today: string;
  income: RecurringItemView[];
  bills: RecurringItemView[];
  monthlyIncomeCents: number;
  monthlyBillsCents: number;
  hasStartDate: boolean;
};

type Match = { transactionId: string; date: string; amountCents: number; incomeSourceId: string | null; recurringRuleId: string | null; expectedDate: string | null };

/** Everything the Recurring page shows: each item's status, amounts, and matches, plus monthly totals. */
export async function getRecurringOverview(db: Database, userId: string, now: Date = new Date()): Promise<RecurringOverview> {
  const settings = await getSettings(db, userId);
  const today = todayInTimeZone(settings.timezone, now);
  const startDate = settings.trackingStartDate;
  if (!startDate) return { today, income: [], bills: [], monthlyIncomeCents: 0, monthlyBillsCents: 0, hasStartDate: false };

  const [income, rules, matchRows, through, accountRows, categoryRows] = await Promise.all([
    listIncomeSources(db, userId),
    listRecurringRules(db, userId),
    db
      .select({
        transactionId: transactions.id,
        date: transactions.date,
        amountCents: transactions.amountCents,
        incomeSourceId: transactions.incomeSourceId,
        recurringRuleId: transactions.recurringRuleId,
        expectedDate: transactions.expectedDate,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), or(isNotNull(transactions.incomeSourceId), isNotNull(transactions.recurringRuleId))))
      .orderBy(desc(transactions.date), desc(transactions.id)),
    db
      .select({ accountId: transactions.accountId, last: sql<string>`max(${transactions.date})::text` })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), ne(transactions.status, "excluded")))
      .groupBy(transactions.accountId),
    db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.userId, userId)),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, userId)),
  ]);

  const dataThroughByAccount = new Map(through.map((r) => [r.accountId, r.last]));
  const anyDataThrough = through.reduce<string | null>((max, r) => (max === null || r.last > max ? r.last : max), null);
  const accountName = new Map(accountRows.map((a) => [a.id, a.name]));
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));

  const view = (item: IncomeSource | RecurringRule, ref: ItemRef, kind: "income" | RecurringKind, matches: Match[]): RecurringItemView => {
    const schedule = { frequency: item.frequency, anchorDate: item.anchorDate, secondDay: item.secondDay };
    const irregular = item.frequency === "irregular";
    const status = itemStatus({
      schedule,
      active: item.active,
      fulfilled: new Set(matches.flatMap((m) => (m.expectedDate ? [m.expectedDate] : []))),
      startDate,
      today,
      dataThrough: item.accountId ? (dataThroughByAccount.get(item.accountId) ?? null) : anyDataThrough,
    });
    const mode = "amountMode" in item ? item.amountMode : item.amountVaries ? "varies_rule" : "fixed_rule";
    const amount = planningAmount({
      mode,
      expectedCents: item.expectedCents,
      irregular,
      matches: matches.map((m) => ({ date: m.date, amountCents: m.amountCents })),
      today,
    });
    const recent = matches.slice(0, 6).map((m) => ({ transactionId: m.transactionId, date: m.date, amountCents: Math.abs(m.amountCents) }));
    return {
      ref,
      name: item.name,
      kind,
      frequency: item.frequency,
      amountCents: amount.cents,
      amountBasis: amount.basis,
      monthlyCents: amount.cents === null ? null : item.frequency === "irregular" ? amount.cents : monthlyEquivalentCents(amount.cents, item.frequency),
      ...status,
      lastMatch: recent[0] ? { date: recent[0].date, amountCents: recent[0].amountCents } : null,
      recentMatches: recent,
      accountName: item.accountId ? (accountName.get(item.accountId) ?? null) : null,
      categoryName: item.categoryId ? (categoryName.get(item.categoryId) ?? null) : null,
      item,
    };
  };

  const incomeViews = income.map((s) => view(s, { kind: "income", id: s.id }, "income", matchRows.filter((m) => m.incomeSourceId === s.id)));
  const billViews = rules
    .map((r) => view(r, { kind: "recurring", id: r.id }, r.kind, matchRows.filter((m) => m.recurringRuleId === r.id)))
    .sort((a, b) => (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999") || a.name.localeCompare(b.name));

  const total = (views: RecurringItemView[]) => views.filter((v) => v.item.active).reduce((sum, v) => sum + (v.monthlyCents ?? 0), 0);
  return {
    today,
    income: incomeViews,
    bills: billViews,
    monthlyIncomeCents: total(incomeViews),
    monthlyBillsCents: total(billViews.filter((v) => v.kind !== "transfer")),
    hasStartDate: true,
  };
}
