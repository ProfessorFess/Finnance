import { createHash } from "node:crypto";
import type { ParsedRow } from "./types";

const keyOf = (r: ParsedRow) => `${r.date}|${r.amountCents}|${r.description.toLowerCase()}`;

/**
 * Numbers identical (date, amount, description) rows in file order: the first
 * is occurrence 0, the second 1, … so two real same-day coffees stay distinct,
 * while re-importing the same day's rows reproduces the same numbers.
 */
export function assignOccurrences(rows: ParsedRow[]): (ParsedRow & { occurrence: number })[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const k = keyOf(r);
    const occurrence = seen.get(k) ?? 0;
    seen.set(k, occurrence + 1);
    return { ...r, occurrence };
  });
}

/** Stable identity of an imported row within an account (unique index target). */
export function dedupeHash(accountId: string, row: ParsedRow, occurrence: number): string {
  if (row.externalId) return `ext:${row.externalId}`;
  return createHash("sha256").update(`${accountId}|${keyOf(row)}|${occurrence}`).digest("hex");
}
