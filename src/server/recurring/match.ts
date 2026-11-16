import { addDays, daysBetween } from "@/lib/dates";
import { containsWords } from "@/server/categorize/rules";
import type { ItemRef } from "./items-service";
import { MATCH_WINDOW_DAYS, occurrencesBetween, type Schedule } from "./schedule";

/** A paycheck, bill, subscription, or recurring transfer, reduced to what matching needs. */
export type MatchItem = {
  ref: ItemRef;
  direction: "in" | "out";
  schedule: Schedule;
  pattern: string;
  /** Only rows in this account; null = any account. */
  accountId: string | null;
  amount: { mode: "any" } | { mode: "near"; cents: number; toleranceCents: number };
  /** Recurring transfers may take rows paired as transfers; nothing else does. */
  allowTransfers: boolean;
};

export type MatchCandidate = {
  id: string;
  date: string;
  amountCents: number;
  accountId: string;
  description: string;
  merchant: string | null;
  isTransfer: boolean;
};

export type MatchLink = { transactionId: string; ref: ItemRef; expectedDate: string | null };

const refKey = (ref: ItemRef) => `${ref.kind}:${ref.id}`;

/** The item's match text, as whole words, in the bank description or the cleaned-up merchant. */
export function matchesPattern(pattern: string, t: { description: string; merchant: string | null }): boolean {
  return containsWords(t.description, pattern) || containsWords(t.merchant ?? "", pattern);
}

function amountDistance(item: MatchItem, c: MatchCandidate): number | null {
  if (item.amount.mode === "any") return 0;
  const d = Math.abs(Math.abs(c.amountCents) - item.amount.cents);
  return d <= item.amount.toleranceCents ? d : null;
}

function fits(item: MatchItem, c: MatchCandidate): boolean {
  if (item.direction === "in" ? c.amountCents <= 0 : c.amountCents >= 0) return false;
  if (item.accountId && item.accountId !== c.accountId) return false;
  if (c.isTransfer && !item.allowTransfers) return false;
  if (!matchesPattern(item.pattern, c)) return false;
  return amountDistance(item, c) !== null;
}

/**
 * Links transactions to the expected occurrences they fulfil. A transaction
 * fulfils an occurrence when it fits the item (direction, match text, account,
 * amount) and lands within ±3 days. Closest dates win, then closest amounts;
 * each transaction and each occurrence is used at most once. Irregular income
 * takes every fitting transaction left over, with no expected date.
 */
export function findMatches(
  items: MatchItem[],
  candidates: MatchCandidate[],
  taken: { ref: ItemRef; expectedDate: string }[],
  window: { from: string; to: string },
): MatchLink[] {
  const takenKeys = new Set(taken.map((t) => `${refKey(t.ref)}|${t.expectedDate}`));
  const pairs: { item: MatchItem; occurrence: string; c: MatchCandidate; dateDist: number; amountDist: number }[] = [];

  for (const item of items) {
    if (item.schedule.frequency === "irregular") continue;
    const fitting = candidates.filter((c) => fits(item, c));
    if (fitting.length === 0) continue;
    const occurrences = occurrencesBetween(item.schedule, addDays(window.from, -MATCH_WINDOW_DAYS), addDays(window.to, MATCH_WINDOW_DAYS)).filter(
      (o) => !takenKeys.has(`${refKey(item.ref)}|${o}`),
    );
    for (const occurrence of occurrences) {
      for (const c of fitting) {
        const dateDist = Math.abs(daysBetween(occurrence, c.date));
        if (dateDist <= MATCH_WINDOW_DAYS) pairs.push({ item, occurrence, c, dateDist, amountDist: amountDistance(item, c)! });
      }
    }
  }

  pairs.sort(
    (a, b) =>
      a.dateDist - b.dateDist ||
      a.amountDist - b.amountDist ||
      a.c.date.localeCompare(b.c.date) ||
      a.c.id.localeCompare(b.c.id) ||
      a.occurrence.localeCompare(b.occurrence),
  );

  const usedTx = new Set<string>();
  const usedOccurrence = new Set<string>();
  const links: MatchLink[] = [];
  for (const p of pairs) {
    const occKey = `${refKey(p.item.ref)}|${p.occurrence}`;
    if (usedTx.has(p.c.id) || usedOccurrence.has(occKey)) continue;
    usedTx.add(p.c.id);
    usedOccurrence.add(occKey);
    links.push({ transactionId: p.c.id, ref: p.item.ref, expectedDate: p.occurrence });
  }

  const byDate = [...candidates].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const item of items) {
    if (item.schedule.frequency !== "irregular") continue;
    for (const c of byDate) {
      if (usedTx.has(c.id) || !fits(item, c)) continue;
      usedTx.add(c.id);
      links.push({ transactionId: c.id, ref: item.ref, expectedDate: null });
    }
  }
  return links;
}
