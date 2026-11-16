import { addDays, daysBetween } from "@/lib/dates";
import type { AmountMode } from "@/server/db/schema";
import { DUE_SOON_DAYS, ESTIMATE_LOOKBACK_DAYS, MATCH_WINDOW_DAYS, nextOccurrence, occurrencesBetween, type Schedule } from "./schedule";

export type ItemState = "paused" | "irregular" | "late" | "awaiting" | "due_soon" | "upcoming";
export type ItemStatus = { state: ItemState; nextDate: string | null; lateDates: string[]; awaitingDates: string[] };

/**
 * Where an item stands today. A missed occurrence is "late" only once the
 * imported data for its account reaches past it (plus the matching window);
 * until then it is "awaiting" an import, because the user imports in batches.
 */
export function itemStatus(input: {
  schedule: Schedule;
  active: boolean;
  fulfilled: Set<string>;
  startDate: string;
  today: string;
  dataThrough: string | null;
}): ItemStatus {
  const { schedule, fulfilled, startDate, today, dataThrough } = input;
  if (schedule.frequency === "irregular" || !schedule.anchorDate) return { state: "irregular", nextDate: null, lateDates: [], awaitingDates: [] };

  const from = startDate > schedule.anchorDate ? startDate : schedule.anchorDate;
  let nextDate: string | null = null;
  for (let d = nextOccurrence(schedule, today > from ? today : from); d; d = nextOccurrence(schedule, addDays(d, 1))) {
    if (!fulfilled.has(d)) {
      nextDate = d;
      break;
    }
  }
  if (!input.active) return { state: "paused", nextDate, lateDates: [], awaitingDates: [] };

  const lateDates: string[] = [];
  const awaitingDates: string[] = [];
  for (const d of occurrencesBetween(schedule, from, today)) {
    if (fulfilled.has(d)) continue;
    if (dataThrough && addDays(d, MATCH_WINDOW_DAYS) <= dataThrough) lateDates.push(d);
    else awaitingDates.push(d);
  }
  const state: ItemState = lateDates.length
    ? "late"
    : awaitingDates.length
      ? "awaiting"
      : nextDate && nextDate <= addDays(today, DUE_SOON_DAYS)
        ? "due_soon"
        : "upcoming";
  return { state, nextDate, lateDates, awaitingDates };
}

export type AmountBasis = "set" | "estimate" | "history" | "unknown";

/**
 * The amount to plan with. Fixed amounts are used as set. "Varies" uses the
 * typical amount the user gave, else the latest deposit. "Estimated" uses the
 * user's estimate until 3 months of deposits exist, then the 3-month average
 * (per occurrence; for irregular income, per month).
 */
export function planningAmount(input: {
  mode: AmountMode | "fixed_rule" | "varies_rule";
  expectedCents: number | null;
  irregular: boolean;
  matches: { date: string; amountCents: number }[];
  today: string;
}): { cents: number | null; basis: AmountBasis } {
  const { mode, expectedCents, matches, today } = input;
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  if (input.irregular && expectedCents === null && mode !== "estimated") return monthlyAverage(sorted, today);
  if (mode === "fixed" || mode === "fixed_rule") return expectedCents === null ? fromLatest(sorted) : { cents: expectedCents, basis: "set" };
  if (mode === "varies" && !input.irregular) {
    // A paycheck that varies plans with its recent average once there are two or more;
    // a typical amount the user gave is an estimate (shown with ≈).
    const since = addDays(today, -ESTIMATE_LOOKBACK_DAYS);
    const recent = sorted.filter((m) => m.date >= since && m.date <= today).map((m) => Math.abs(m.amountCents));
    if (recent.length >= 2) return { cents: Math.round(recent.reduce((a, b) => a + b, 0) / recent.length), basis: "history" };
    if (expectedCents !== null) return { cents: expectedCents, basis: "estimate" };
    return fromLatest(sorted);
  }
  if (mode === "varies" || mode === "varies_rule") return expectedCents === null ? fromLatest(sorted) : { cents: expectedCents, basis: "set" };

  const since = addDays(today, -ESTIMATE_LOOKBACK_DAYS);
  if (sorted.length && sorted[0]!.date <= since) {
    const recent = sorted.filter((m) => m.date >= since && m.date <= today).map((m) => Math.abs(m.amountCents));
    const sum = recent.reduce((a, b) => a + b, 0);
    if (input.irregular) return { cents: Math.round(sum / 3), basis: "history" };
    if (recent.length) return { cents: Math.round(sum / recent.length), basis: "history" };
  }
  return expectedCents === null ? { cents: null, basis: "unknown" } : { cents: expectedCents, basis: "estimate" };
}

function fromLatest(sorted: { amountCents: number }[]): { cents: number | null; basis: AmountBasis } {
  const last = sorted[sorted.length - 1];
  return last ? { cents: Math.abs(last.amountCents), basis: "history" } : { cents: null, basis: "unknown" };
}

/** Irregular income per month: deposits over the last 3 months, averaged over the months seen (at least one). */
function monthlyAverage(sorted: { date: string; amountCents: number }[], today: string): { cents: number | null; basis: AmountBasis } {
  const since = addDays(today, -ESTIMATE_LOOKBACK_DAYS);
  const recent = sorted.filter((m) => m.date >= since && m.date <= today);
  if (recent.length === 0) return { cents: null, basis: "unknown" };
  const sum = recent.reduce((a, m) => a + Math.abs(m.amountCents), 0);
  const months = Math.min(3, Math.max(1, (daysBetween(recent[0]!.date, today) + 1) / 30));
  return { cents: Math.round(sum / months), basis: "history" };
}
