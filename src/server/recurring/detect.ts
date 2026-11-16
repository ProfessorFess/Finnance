import { addDays, daysBetween } from "@/lib/dates";
import { occurrencesBetween } from "./schedule";

export type DetectRow = { date: string; amountCents: number; merchant: string | null; accountId: string; categoryId: string | null };
export type DetectedFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
export type Suggestion = {
  merchantKey: string;
  merchant: string;
  direction: "in" | "out";
  frequency: DetectedFrequency;
  amountCents: number;
  amountVaries: boolean;
  count: number;
  lastDate: string;
  nextDate: string;
  accountId: string;
  categoryId: string | null;
};

/** Typical gap, the median gaps that count as this frequency, and how far each gap may wander. */
const CLASSES: { frequency: DetectedFrequency; nominal: number; min: number; max: number; tolerance: number }[] = [
  { frequency: "weekly", nominal: 7, min: 6, max: 8, tolerance: 1 },
  { frequency: "biweekly", nominal: 14, min: 13, max: 15, tolerance: 2 },
  { frequency: "monthly", nominal: 30, min: 27, max: 33, tolerance: 4 },
  { frequency: "quarterly", nominal: 91, min: 85, max: 97, tolerance: 7 },
  { frequency: "yearly", nominal: 365, min: 355, max: 375, tolerance: 10 },
];
const MONTHS: Partial<Record<DetectedFrequency, "monthly" | "quarterly" | "yearly">> = { monthly: "monthly", quarterly: "quarterly", yearly: "yearly" };

/** Lower middle of the sorted values. */
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]!;
function mostCommon<T>(xs: T[]): T {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

/**
 * Light recurring detection (spec 7.4): the same merchant, 3+ times, at a
 * steady weekly-to-yearly interval, and seen recently. Amounts may vary.
 */
export function detectRecurring(rows: DetectRow[], dataThrough: string): Suggestion[] {
  const groups = new Map<string, DetectRow[]>();
  for (const row of rows) {
    if (!row.merchant || row.amountCents === 0) continue;
    const key = `${row.amountCents > 0 ? "in" : "out"}|${row.merchant.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const out: Suggestion[] = [];
  for (const [key, group] of groups) {
    if (group.length < 3) continue;
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const gaps = sorted.slice(1).map((r, i) => daysBetween(sorted[i]!.date, r.date));
    const mid = median(gaps);
    const cls = CLASSES.find((c) => mid >= c.min && mid <= c.max);
    if (!cls) continue;
    if (gaps.filter((g) => Math.abs(g - mid) <= cls.tolerance).length / gaps.length < 0.75) continue;
    const lastDate = sorted[sorted.length - 1]!.date;
    if (daysBetween(lastDate, dataThrough) > cls.nominal * 1.5 + cls.tolerance) continue;

    const amounts = sorted.map((r) => Math.abs(r.amountCents));
    const amountCents = median(amounts);
    const monthly = MONTHS[cls.frequency];
    const nextDate = monthly
      ? occurrencesBetween({ frequency: monthly, anchorDate: lastDate, secondDay: null }, addDays(lastDate, 1), addDays(lastDate, 400))[0]!
      : addDays(lastDate, cls.nominal);
    const [direction, merchantKey] = key.split("|") as ["in" | "out", string];
    out.push({
      merchantKey,
      merchant: mostCommon(sorted.map((r) => r.merchant!)),
      direction,
      frequency: cls.frequency,
      amountCents,
      amountVaries: (Math.max(...amounts) - Math.min(...amounts)) / amountCents > 0.2,
      count: sorted.length,
      lastDate,
      nextDate,
      accountId: mostCommon(sorted.map((r) => r.accountId)),
      categoryId: mostCommon(sorted.map((r) => r.categoryId)),
    });
  }
  return out.sort((a, b) => b.count - a.count || a.merchant.localeCompare(b.merchant));
}
