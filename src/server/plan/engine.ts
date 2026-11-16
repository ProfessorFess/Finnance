/**
 * The bucket engine: pure building blocks for budget plans. No database access,
 * so the UI can use the same math (for example the live health line while a
 * plan is being shaped). Nothing here knows about templates or any one user.
 */
import { addDays, daysBetween, monthWindow, weekWindow } from "@/lib/dates";
import type { BucketRole, FundingType, LimitPeriod, PlanCadence } from "@/server/db/finance-schema";
import { type Frequency, monthlyEquivalentCents, type ScheduledFrequency } from "@/server/recurring/schedule";

/** Regular paychecks a month (the spreadsheet's convention: a 3rd biweekly or 5th weekly check is extra). */
export const PAYCHECKS_PER_MONTH: Record<ScheduledFrequency, number> = {
  weekly: 4,
  biweekly: 2,
  semimonthly: 2,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

const LOOKBACK_DAYS = 90;

/**
 * How many incomes a plan expects in a month: scheduled sources by their
 * frequency, irregular ones by how often they've actually paid lately.
 * Never less than 1, so shares of monthly bills always divide.
 */
export function incomesPerMonth(sources: { frequency: Frequency; eventDates: string[] }[], today: string): number {
  let total = 0;
  for (const s of sources) {
    if (s.frequency !== "irregular") {
      total += PAYCHECKS_PER_MONTH[s.frequency];
      continue;
    }
    const since = addDays(today, -LOOKBACK_DAYS);
    const recent = s.eventDates.filter((d) => d >= since && d <= today).sort();
    if (recent.length === 0) continue;
    const months = Math.min(3, Math.max(1, (daysBetween(recent[0]!, today) + 1) / 30));
    total += recent.length / months;
  }
  return total > 0 ? total : 1;
}

/** An income from a scheduled source beyond its regular count for the month (the 3rd biweekly paycheck). */
export function isExtraIncome(frequency: Frequency, positionInMonth: number): boolean {
  if (frequency === "irregular") return false;
  return positionInMonth > PAYCHECKS_PER_MONTH[frequency];
}

export type EngineBucket = {
  id: string;
  role: BucketRole;
  fundingType: FundingType;
  fundingCents: number | null;
  fundingBps: number | null;
  limitCents: number | null;
  limitPeriod: LimitPeriod | null;
  trackCategoryIds: string[];
  destinationAccountId: string | null;
  /** Recurring rules (bills) paid from this bucket. */
  linkedRuleIds: string[];
  /** Their monthly total. */
  linkedMonthlyCents: number;
};

export type Health = { kind: "fully_allocated" } | { kind: "unassigned"; cents: number } | { kind: "over"; cents: number };

/**
 * Splits one income (or one month's income) across buckets by their funding
 * rules. The remainder bucket is never negative; a shortfall shows in health.
 * An extra income goes entirely by its rule.
 */
export function fundIncome(
  buckets: EngineBucket[],
  incomeCents: number,
  perMonth: number,
  extra: { bucketId: string; bps: number } | null,
): { funded: Map<string, number>; health: Health } {
  const funded = new Map<string, number>();
  if (extra) {
    const share = Math.round((incomeCents * extra.bps) / 10_000);
    for (const b of buckets) funded.set(b.id, b.id === extra.bucketId ? share : 0);
    const rest = incomeCents - share;
    return { funded, health: rest > 0 ? { kind: "unassigned", cents: rest } : { kind: "fully_allocated" } };
  }
  let allocated = 0;
  let remainder: EngineBucket | null = null;
  for (const b of buckets) {
    let cents = 0;
    switch (b.fundingType) {
      case "fixed":
        cents = b.fundingCents ?? 0;
        break;
      case "percent":
        cents = Math.round((incomeCents * (b.fundingBps ?? 0)) / 10_000);
        break;
      case "sum_of_recurring":
        cents = Math.round(b.linkedMonthlyCents / perMonth);
        break;
      case "remainder":
        remainder = b;
        continue;
    }
    funded.set(b.id, cents);
    allocated += cents;
  }
  const rest = incomeCents - allocated;
  if (remainder) funded.set(remainder.id, Math.max(0, rest));
  const health: Health = rest < 0 ? { kind: "over", cents: -rest } : !remainder && rest > 0 ? { kind: "unassigned", cents: rest } : { kind: "fully_allocated" };
  // Keep bucket order in the map.
  return { funded: new Map(buckets.map((b) => [b.id, funded.get(b.id) ?? 0])), health };
}

/** The window a limit counts over. */
export function limitWindow(
  period: LimitPeriod,
  today: string,
  weekStartDay: number,
  lastIncomeDate: string | null,
  fallbackStart: string,
): { start: string; end: string } {
  if (period === "weekly") return weekWindow(today, weekStartDay);
  if (period === "monthly") return monthWindow(today);
  return { start: lastIncomeDate ?? fallbackStart, end: today };
}

/**
 * A funding amount that covers a limit. Per-income plans budget 4 weeks a month
 * (the spreadsheet's convention; extra incomes cover the rest).
 */
export function suggestedFunding(limitCents: number, period: LimitPeriod, perMonth: number, cadence: PlanCadence): number {
  if (cadence === "monthly") return period === "weekly" ? Math.round((limitCents * 52) / 12) : limitCents;
  if (period === "weekly") return Math.round((limitCents * 4) / perMonth);
  if (period === "monthly") return Math.round(limitCents / perMonth);
  return limitCents;
}

export type ActivityRow = {
  date: string;
  amountCents: number;
  accountId: string;
  categoryId: string | null;
  isTransfer: boolean;
  recurringRuleId: string | null;
};

const inWindow = (r: ActivityRow, w: { start: string; end: string }) => r.date >= w.start && r.date <= w.end;

/**
 * What a bucket has spent or moved in a window, in positive cents. Spending
 * buckets count their categories and their bills (refunds reduce it);
 * savings and goal buckets count transfers into their destination.
 */
export function bucketActivity(bucket: EngineBucket, rows: ActivityRow[], window: { start: string; end: string }): number {
  const linked = new Set(bucket.linkedRuleIds);
  const tracked = new Set(bucket.trackCategoryIds);
  // Savings and goals track money moved; so does a buffer that has somewhere to move to.
  const saving = bucket.role === "savings" || bucket.role === "goal" || (bucket.role === "buffer" && bucket.destinationAccountId !== null);
  let total = 0;
  for (const r of rows) {
    if (!inWindow(r, window)) continue;
    if (r.recurringRuleId && linked.has(r.recurringRuleId)) {
      total -= r.amountCents;
      continue;
    }
    if (saving) {
      if (bucket.destinationAccountId && r.accountId === bucket.destinationAccountId && r.isTransfer && r.amountCents > 0) total += r.amountCents;
      continue;
    }
    if (!r.isTransfer && r.categoryId && tracked.has(r.categoryId)) total -= r.amountCents;
  }
  return total;
}

export type AllocationTask = { bucketId: string; amountCents: number; movedCents: number; destinationAccountId: string; done: boolean };

/** Transfers that landed in an account during a window. */
export function destinationInflow(accountId: string, rows: ActivityRow[], window: { start: string; end: string }): number {
  return rows
    .filter((r) => inWindow(r, window) && r.accountId === accountId && r.isTransfer && r.amountCents > 0)
    .reduce((sum, r) => sum + r.amountCents, 0);
}

/**
 * When several buckets move money to the same account, one transfer can't
 * count for all of them: the account's transfers are handed out in bucket
 * order, each up to its target, and the last one takes whatever is left.
 */
export function shareDestinations(
  entries: { id: string; destinationAccountId: string; targetCents: number; inflowCents: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<string, typeof entries>();
  for (const e of entries) groups.set(e.destinationAccountId, [...(groups.get(e.destinationAccountId) ?? []), e]);
  for (const group of groups.values()) {
    let pool = Math.max(...group.map((e) => e.inflowCents));
    group.forEach((e, i) => {
      const share = i === group.length - 1 ? pool : Math.min(pool, Math.max(0, e.targetCents));
      out.set(e.id, share);
      pool -= share;
    });
  }
  return new Map(entries.map((e) => [e.id, out.get(e.id) ?? 0]));
}

/** "Move $400 to Ally Savings" for each bucket with a destination, ticked off by transfers that land there. */
export function allocationTasks(
  buckets: EngineBucket[],
  funded: Map<string, number>,
  rows: ActivityRow[],
  window: { start: string; end: string },
): AllocationTask[] {
  const due = buckets.filter((b) => b.destinationAccountId && (funded.get(b.id) ?? 0) > 0);
  const moved = shareDestinations(
    due.map((b) => ({ id: b.id, destinationAccountId: b.destinationAccountId!, targetCents: funded.get(b.id)!, inflowCents: destinationInflow(b.destinationAccountId!, rows, window) })),
  );
  return due.map((b) => {
    const amountCents = funded.get(b.id)!;
    const movedCents = moved.get(b.id) ?? 0;
    return { bucketId: b.id, amountCents, movedCents, destinationAccountId: b.destinationAccountId!, done: movedCents >= amountCents };
  });
}

/**
 * A typical income: the mean of the deposits in the last 90 days, else the
 * mean of what the sources are expected to pay, else unknown.
 */
export function typicalPerIncome(events: { date: string; amountCents: number }[], expected: number[], today: string): number | null {
  const since = addDays(today, -LOOKBACK_DAYS);
  const recent = events.filter((e) => e.date >= since && e.date <= today);
  if (recent.length) return Math.round(recent.reduce((s, e) => s + e.amountCents, 0) / recent.length);
  return expected.length ? Math.round(expected.reduce((a, b) => a + b, 0) / expected.length) : null;
}

/**
 * A plan's typical income, the same everywhere (the create preview and the
 * Plan page): per income, recent deposits or else what's expected; per month,
 * the sum of what each source is expected to bring in a month (null when
 * nothing has an amount yet). `planningCents` is per occurrence for scheduled
 * sources and per month for irregular ones; pass null for paused sources.
 */
export function planTypicalIncome(
  cadence: PlanCadence,
  sources: { frequency: Frequency; planningCents: number | null; events: { date: string; amountCents: number }[] }[],
  today: string,
): number | null {
  const known = sources.filter((s): s is typeof s & { planningCents: number } => s.planningCents !== null);
  if (cadence === "per_income") {
    return typicalPerIncome(
      sources.flatMap((s) => s.events),
      known.map((s) => s.planningCents),
      today,
    );
  }
  if (known.length === 0) return null;
  return known.reduce((sum, s) => sum + (s.frequency === "irregular" ? s.planningCents : monthlyEquivalentCents(s.planningCents, s.frequency)), 0);
}
