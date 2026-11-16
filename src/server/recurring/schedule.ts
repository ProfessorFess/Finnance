import { addDays, daysBetween, lastDayOfMonth } from "@/lib/dates";

export type Frequency = "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "yearly" | "irregular";
export type ScheduledFrequency = Exclude<Frequency, "irregular">;

/**
 * When an item is expected. `anchorDate` is the first occurrence (items repeat
 * forward from it, never before). `secondDay` is only for twice-a-month items:
 * 1–31, where 31 means the last day of the month.
 */
export type Schedule = { frequency: Frequency; anchorDate: string | null; secondDay: number | null };

/** A transaction fulfils an occurrence within this many days either side. */
export const MATCH_WINDOW_DAYS = 3;
/** "Due soon" when the next occurrence is at most this many days away. */
export const DUE_SOON_DAYS = 7;
/** How far back "the last 3 months" of deposits reaches. */
export const ESTIMATE_LOOKBACK_DAYS = 90;

/** How far a charge may differ from the expected amount and still match: ±20%, at least $2. */
export function defaultToleranceCents(expectedCents: number): number {
  return Math.max(200, Math.round(expectedCents * 0.2));
}

export const PERIODS_PER_YEAR: Record<ScheduledFrequency, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, quarterly: 4, yearly: 1 };

export function monthlyEquivalentCents(cents: number, frequency: ScheduledFrequency): number {
  return Math.round((cents * PERIODS_PER_YEAR[frequency]) / 12);
}

const MONTH_STEP: Partial<Record<Frequency, number>> = { monthly: 1, quarterly: 3, yearly: 12 };
const DAY_STEP: Partial<Record<Frequency, number>> = { weekly: 7, biweekly: 14 };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${pad(m)}-${pad(d)}`;
const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
/** Month index → year and month (1–12). */
const monthAt = (index: number): [number, number] => [Math.floor(index / 12), (index % 12) + 1];

/** Expected dates in [from, to], ascending, never before the anchor. Irregular items have none. */
export function occurrencesBetween(s: Schedule, from: string, to: string): string[] {
  if (s.frequency === "irregular" || !s.anchorDate) return [];
  const anchor = s.anchorDate;
  const start = from > anchor ? from : anchor;
  if (start > to) return [];
  const out: string[] = [];

  const dayStep = DAY_STEP[s.frequency];
  if (dayStep) {
    const k = Math.ceil(daysBetween(anchor, start) / dayStep);
    for (let d = addDays(anchor, k * dayStep); d <= to; d = addDays(d, dayStep)) out.push(d);
    return out;
  }

  const [ay, am, ad] = parts(anchor);
  const [sy, sm] = parts(start);
  const [ty, tm] = parts(to);
  const anchorIndex = ay * 12 + (am - 1);
  const lastIndex = ty * 12 + (tm - 1);

  if (s.frequency === "semimonthly") {
    const days = [ad, s.secondDay ?? ad];
    for (let i = sy * 12 + (sm - 1); i <= lastIndex; i++) {
      const [y, m] = monthAt(i);
      const last = lastDayOfMonth(y, m);
      const dates = [...new Set(days.map((d) => ymd(y, m, Math.min(d, last))))].sort();
      for (const d of dates) if (d >= start && d <= to) out.push(d);
    }
    return out;
  }

  const step = MONTH_STEP[s.frequency]!;
  const firstK = Math.max(0, Math.floor((sy * 12 + (sm - 1) - anchorIndex) / step));
  for (let i = anchorIndex + firstK * step; i <= lastIndex; i += step) {
    const [y, m] = monthAt(i);
    const d = ymd(y, m, Math.min(ad, lastDayOfMonth(y, m)));
    if (d >= start && d <= to) out.push(d);
  }
  return out;
}

/** The first expected date on or after `onOrAfter`, or null for irregular items. */
export function nextOccurrence(s: Schedule, onOrAfter: string): string | null {
  return occurrencesBetween(s, onOrAfter, addDays(onOrAfter, 400))[0] ?? null;
}
