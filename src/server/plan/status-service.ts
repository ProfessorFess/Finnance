import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { addDays, monthWindow, todayInTimeZone } from "@/lib/dates";
import { accounts, incomeSources, NOT_A_TRANSFER, recurringRules, transactions } from "@/server/db/schema";
import type { BucketRole, FundingType, LimitPeriod, PlanCadence, PlanTemplate } from "@/server/db/finance-schema";
import type { Database } from "@/server/db/types";
import { getSettings } from "@/server/finance/settings";
import type { IncomeSource } from "@/server/recurring/items-service";
import { monthlyEquivalentCents, nextOccurrence } from "@/server/recurring/schedule";
import { planningAmount } from "@/server/recurring/status";
import {
  type ActivityRow,
  type AllocationTask,
  allocationTasks,
  bucketActivity,
  destinationInflow,
  type EngineBucket,
  fundIncome,
  type Health,
  incomesPerMonth,
  isExtraIncome,
  limitWindow,
  planTypicalIncome,
  shareDestinations,
} from "./engine";
import { bucketDraftOf, getActivePlan } from "./plans-service";
import type { BucketDraft } from "./templates";

export type BucketView = {
  id: string;
  name: string;
  icon: string;
  role: BucketRole;
  fundingType: FundingType;
  /** From the latest income (or this month). */
  fundedCents: number;
  /** For a typical income. */
  typicalFundedCents: number | null;
  monthlyCents: number | null;
  limitCents: number | null;
  limitPeriod: LimitPeriod | null;
  window: { start: string; end: string };
  resetsOn: string | null;
  activityCents: number;
  remainingCents: number | null;
  destinationAccountName: string | null;
  draft: BucketDraft;
};

export type TaskView = AllocationTask & { bucketName: string; destinationAccountName: string };

export type PlanStatus = {
  plan: { id: string; name: string; cadence: PlanCadence; template: PlanTemplate };
  incomes: { id: string; name: string; scheduled: boolean }[];
  today: string;
  problem: null | "no_income";
  /** The latest income, and whether it covered the plan (a small paycheck shows "Over by"). */
  latestIncome: { transactionId: string; sourceName: string; date: string; amountCents: number; isExtra: boolean; health: Health } | null;
  /** expectedCents is null when no income has an amount to expect yet. */
  month: { month: string; expectedCents: number | null; receivedCents: number } | null;
  nextExpected: { sourceName: string; date: string; amountCents: number | null } | null;
  typicalIncomeCents: number | null;
  incomesPerMonth: number;
  health: Health | null;
  buckets: BucketView[];
  tasks: TaskView[];
};

type IncomeEvent = { id: string; sourceId: string; date: string; expectedDate: string | null; amountCents: number };


function planningFor(source: IncomeSource, events: IncomeEvent[], today: string) {
  return planningAmount({
    mode: source.amountMode,
    expectedCents: source.expectedCents,
    irregular: source.frequency === "irregular",
    matches: events.filter((e) => e.sourceId === source.id).map((e) => ({ date: e.date, amountCents: e.amountCents })),
    today,
  });
}

/** What the Plan page shows: the latest income (or this month), each bucket against its limit, and the move tasks. */
export async function getPlanStatus(db: Database, userId: string, now: Date = new Date()): Promise<PlanStatus | null> {
  const active = await getActivePlan(db, userId);
  if (!active) return null;
  const { plan, buckets, rules } = active;
  const settings = await getSettings(db, userId);
  const today = todayInTimeZone(settings.timezone, now);
  const startDate = settings.trackingStartDate ?? today;

  const sources = active.incomeSourceIds.length
    ? await db.select().from(incomeSources).where(and(eq(incomeSources.userId, userId), inArray(incomeSources.id, active.incomeSourceIds)))
    : [];
  const sourceName = new Map(sources.map((s) => [s.id, s.name]));

  const events: IncomeEvent[] = sources.length
    ? (
        await db
          .select({
            id: transactions.id,
            sourceId: transactions.incomeSourceId,
            date: transactions.date,
            expectedDate: transactions.expectedDate,
            amountCents: transactions.amountCents,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              inArray(transactions.incomeSourceId, sources.map((s) => s.id)),
              ne(transactions.status, "excluded"),
              sql`${transactions.amountCents} > 0`,
              gte(transactions.date, startDate),
              lte(transactions.date, today),
            ),
          )
      ).map((e) => ({ ...e, sourceId: e.sourceId! }))
    : [];
  events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  // Bills paid from each bucket.
  const bucketIds = buckets.map((b) => b.id);
  const linkedRules = bucketIds.length
    ? await db
        .select()
        .from(recurringRules)
        .where(and(eq(recurringRules.userId, userId), eq(recurringRules.active, true), inArray(recurringRules.bucketId, bucketIds)))
    : [];
  const engineBuckets: EngineBucket[] = buckets.map((b) => {
    const mine = linkedRules.filter((r) => r.bucketId === b.id);
    return {
      id: b.id,
      role: b.role,
      fundingType: b.fundingType,
      fundingCents: b.fundingCents,
      fundingBps: b.fundingBps,
      limitCents: b.limitCents,
      limitPeriod: b.limitPeriod,
      trackCategoryIds: b.trackCategoryIds,
      destinationAccountId: b.destinationAccountId,
      linkedRuleIds: mine.map((r) => r.id),
      linkedMonthlyCents: mine.reduce((sum, r) => sum + monthlyEquivalentCents(r.expectedCents, r.frequency), 0),
    };
  });

  const perIncome = plan.cadence === "per_income";
  const perMonth = perIncome ? incomesPerMonth(sources.map((s) => ({ frequency: s.frequency, eventDates: events.filter((e) => e.sourceId === s.id).map((e) => e.date) })), today) : 1;
  const month = monthWindow(today);
  const expectingSources = sources.filter((s) => s.active);

  // The latest income, and whether it's an extra paycheck.
  const last = perIncome ? events[events.length - 1] : undefined;
  let latestIncome: PlanStatus["latestIncome"] = null;
  let extra: { bucketId: string; bps: number } | null = null;
  if (last) {
    const source = sources.find((s) => s.id === last.sourceId)!;
    const rule = rules.find((r) => r.type === "extra_income" && r.incomeSourceId === source.id);
    const key = (e: IncomeEvent) => e.expectedDate ?? e.date;
    const sameMonth = events.filter((e) => e.sourceId === source.id && key(e).slice(0, 7) === key(last).slice(0, 7));
    const position = sameMonth.filter((e) => key(e) < key(last) || (key(e) === key(last) && e.id <= last.id)).length;
    const isExtra = Boolean(rule && source.active && isExtraIncome(source.frequency, position));
    if (isExtra) extra = { bucketId: rule!.bucketId, bps: rule!.percentBps };
    latestIncome = {
      transactionId: last.id,
      sourceName: source.name,
      date: last.date,
      amountCents: last.amountCents,
      isExtra,
      health: fundIncome(engineBuckets, last.amountCents, perMonth, extra).health,
    };
  }

  // A typical income: recent events, else what the sources are expected to pay.
  let monthView: PlanStatus["month"] = null;
  const typicalIncomeCents = planTypicalIncome(
    plan.cadence,
    sources.map((s) => ({
      frequency: s.frequency,
      planningCents: s.active ? planningFor(s, events, today).cents : null,
      events: events.filter((e) => e.sourceId === s.id),
    })),
    today,
  );
  if (!perIncome) {
    const expectedCents = typicalIncomeCents;
    const receivedCents = events.filter((e) => e.date >= month.start && e.date <= month.end).reduce((s, e) => s + e.amountCents, 0);
    monthView = { month: today.slice(0, 7), expectedCents, receivedCents };
  }

  const periodIncome = perIncome ? (last?.amountCents ?? null) : typicalIncomeCents;
  const funded = periodIncome !== null ? fundIncome(engineBuckets, periodIncome, perMonth, extra).funded : new Map<string, number>();
  const typical = typicalIncomeCents !== null ? fundIncome(engineBuckets, typicalIncomeCents, perMonth, null) : null;

  // Activity: everything since the earliest window start.
  const defaultWindow = perIncome ? { start: last?.date ?? startDate, end: today } : month;
  // Bills are paid monthly: a bills bucket without its own limit is measured over the month.
  const windows = new Map(
    buckets.map((b) => [
      b.id,
      b.limitPeriod ? limitWindow(b.limitPeriod, today, settings.weekStartDay, last?.date ?? null, startDate) : b.role === "bills" ? month : defaultWindow,
    ]),
  );
  const earliest = [...windows.values(), defaultWindow].reduce((min, w) => (w.start < min ? w.start : min), today);
  const rows: ActivityRow[] = (
    await db
      .select({
        date: transactions.date,
        amountCents: transactions.amountCents,
        accountId: transactions.accountId,
        categoryId: transactions.categoryId,
        pairId: transactions.transferPairId,
        recurringRuleId: transactions.recurringRuleId,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), ne(transactions.status, "excluded"), gte(transactions.date, earliest)))
  ).map(({ pairId, ...r }) => ({ ...r, isTransfer: pairId !== null && pairId !== NOT_A_TRANSFER }));

  const accountRows = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.userId, userId));
  const accountName = new Map(accountRows.map((a) => [a.id, a.name]));

  // Buckets moving to the same account share its transfers instead of each counting all of them.
  const savers = buckets.flatMap((b, i) =>
    (b.role === "savings" || b.role === "goal") && b.destinationAccountId ? [{ b, eb: engineBuckets[i]! }] : [],
  );
  const inflows = new Map(savers.map(({ b }) => [b.id, destinationInflow(b.destinationAccountId!, rows, windows.get(b.id)!)]));
  const shared = shareDestinations(
    savers.map(({ b }) => ({
      id: b.id,
      destinationAccountId: b.destinationAccountId!,
      targetCents: b.limitCents ?? funded.get(b.id) ?? 0,
      inflowCents: inflows.get(b.id)!,
    })),
  );

  const views: BucketView[] = buckets.map((b, i) => {
    const eb = engineBuckets[i]!;
    const window = windows.get(b.id)!;
    const fundedCents = funded.get(b.id) ?? 0;
    const typicalFundedCents = typical ? (typical.funded.get(b.id) ?? 0) : null;
    const saving = b.role === "savings" || b.role === "goal";
    const target = perIncome && !last ? (typicalFundedCents ?? 0) : fundedCents;
    const monthlyTarget = Math.round((typicalFundedCents ?? fundedCents) * perMonth);
    const limitCents = b.limitCents ?? (saving ? target : b.role === "bills" ? monthlyTarget : null);
    const raw = bucketActivity(eb, rows, window);
    const activityCents = shared.has(b.id) ? raw - inflows.get(b.id)! + shared.get(b.id)! : raw;
    return {
      id: b.id,
      name: b.name,
      icon: b.icon,
      role: b.role,
      fundingType: b.fundingType,
      fundedCents,
      typicalFundedCents,
      monthlyCents: typicalFundedCents === null ? null : Math.round(typicalFundedCents * perMonth),
      limitCents,
      limitPeriod: b.limitPeriod,
      window,
      resetsOn: b.limitPeriod === "weekly" || b.limitPeriod === "monthly" ? addDays(window.end, 1) : null,
      activityCents,
      remainingCents: limitCents === null ? null : limitCents - activityCents,
      destinationAccountName: b.destinationAccountId ? (accountName.get(b.destinationAccountId) ?? null) : null,
      draft: bucketDraftOf(b),
    };
  });

  const taskWindow = perIncome ? (last ? { start: last.date, end: today } : null) : month;
  const tasks: TaskView[] = taskWindow
    ? allocationTasks(engineBuckets, funded, rows, taskWindow).map((task) => ({
        ...task,
        bucketName: buckets.find((b) => b.id === task.bucketId)!.name,
        destinationAccountName: accountName.get(task.destinationAccountId) ?? "",
      }))
    : [];

  // The next expected income from a scheduled, active source.
  const fulfilled = new Set(events.flatMap((e) => (e.expectedDate ? [`${e.sourceId}|${e.expectedDate}`] : [])));
  let nextExpected: PlanStatus["nextExpected"] = null;
  for (const s of expectingSources) {
    if (s.frequency === "irregular") continue;
    const schedule = { frequency: s.frequency, anchorDate: s.anchorDate, secondDay: s.secondDay };
    let date = nextOccurrence(schedule, today);
    while (date && fulfilled.has(`${s.id}|${date}`)) date = nextOccurrence(schedule, addDays(date, 1));
    if (date && (!nextExpected || date < nextExpected.date)) nextExpected = { sourceName: s.name, date, amountCents: planningFor(s, events, today).cents };
  }

  return {
    plan: { id: plan.id, name: plan.name, cadence: plan.cadence, template: plan.template },
    incomes: sources.map((s) => ({ id: s.id, name: sourceName.get(s.id)!, scheduled: s.frequency !== "irregular" })),
    today,
    problem: sources.length === 0 ? "no_income" : null,
    latestIncome,
    month: monthView,
    nextExpected,
    typicalIncomeCents,
    incomesPerMonth: perMonth,
    health: typical?.health ?? null,
    buckets: views,
    tasks,
  };
}

/** Each income source's deposits from the last 90 days (for previews that must match the Plan page). */
export async function recentIncomeEvents(db: Database, userId: string, now: Date = new Date()): Promise<Map<string, { date: string; amountCents: number }[]>> {
  const settings = await getSettings(db, userId);
  const today = todayInTimeZone(settings.timezone, now);
  const since = addDays(today, -90);
  const rows = await db
    .select({ sourceId: transactions.incomeSourceId, date: transactions.date, amountCents: transactions.amountCents })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        sql`${transactions.incomeSourceId} is not null`,
        ne(transactions.status, "excluded"),
        sql`${transactions.amountCents} > 0`,
        gte(transactions.date, settings.trackingStartDate && settings.trackingStartDate > since ? settings.trackingStartDate : since),
        lte(transactions.date, today),
      ),
    );
  const out = new Map<string, { date: string; amountCents: number }[]>();
  for (const r of rows) out.set(r.sourceId!, [...(out.get(r.sourceId!) ?? []), { date: r.date, amountCents: r.amountCents }]);
  return out;
}
