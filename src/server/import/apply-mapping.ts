import { parseDateValue } from "@/lib/dates";
import { parseAmountToCents } from "@/lib/money";
import type { ColumnMapping, ParsedRow, RowError, Table } from "./types";

/**
 * Turns table rows into transactions using a column mapping. Rows with an
 * unreadable date or amount become errors (with their file line) instead of
 * stopping the import.
 */
export function applyMapping(table: Table, mapping: ColumnMapping): { rows: ParsedRow[]; errors: RowError[] } {
  const index = new Map(table.headers.map((h, i) => [h, i]));
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];

  table.rows.forEach((cells, i) => {
    const line = table.lines[i] ?? i + 2;
    const extra = cells.slice(table.headers.length);
    if (cells.length < table.headers.length || extra.some((c) => c.trim() !== "")) {
      errors.push({ line, reason: `Row has ${cells.length} columns, expected ${table.headers.length}` });
      return;
    }
    const get = (col: string | undefined) => (col === undefined ? "" : (cells[index.get(col) ?? -1] ?? "").trim());

    const rawDate = get(mapping.date.column);
    const date = parseDateValue(rawDate, mapping.date.format);
    if (!date) {
      errors.push({ line, reason: `Date: can't read "${rawDate}" in column "${mapping.date.column}"` });
      return;
    }

    const amount = readAmount(mapping, get);
    if ("error" in amount) {
      errors.push({ line, reason: amount.error });
      return;
    }

    const description = get(mapping.description).replace(/\s+/g, " ").trim();
    rows.push({
      line,
      date,
      amountCents: amount.cents,
      description: description || "(no description)",
      pending: mapping.pending ? mapping.pending.values.includes(get(mapping.pending.column)) : false,
      bankCategory: get(mapping.bankCategory) || null,
      accountNumber: get(mapping.accountNumber) || null,
      externalId: null,
    });
  });

  return { rows, errors };
}

function readAmount(mapping: ColumnMapping, get: (col: string) => string): { cents: number } | { error: string } {
  const a = mapping.amount;
  const bad = (col: string) => ({ error: `Amount: can't read "${get(col)}" in column "${col}"` });

  if (a.kind === "signed") {
    const cents = parseAmountToCents(get(a.column));
    if (cents === null) return bad(a.column);
    return { cents: a.invert ? -cents : cents };
  }
  if (a.kind === "indicator") {
    const cents = parseAmountToCents(get(a.column));
    if (cents === null) return bad(a.column);
    const indicator = get(a.indicatorColumn).toLowerCase();
    const credits = (a.creditValues ?? ["credit", "cr"]).map((v) => v.toLowerCase());
    if (a.debitValues.some((v) => v.toLowerCase() === indicator)) return { cents: -Math.abs(cents) };
    if (credits.includes(indicator)) return { cents: Math.abs(cents) };
    return { error: `Amount: "${get(a.indicatorColumn)}" in column "${a.indicatorColumn}" isn't a debit or credit` };
  }
  // Many banks write 0.00 in the unused column, so "present" means non-zero.
  const read = (col: string): number | null | "bad" => {
    const raw = get(col);
    if (!raw) return null;
    const cents = parseAmountToCents(raw);
    return cents === null ? "bad" : cents === 0 ? null : Math.abs(cents);
  };
  const debit = read(a.debitColumn);
  const credit = read(a.creditColumn);
  if (debit === "bad") return bad(a.debitColumn);
  if (credit === "bad") return bad(a.creditColumn);
  if (debit !== null && credit !== null) {
    return { error: `Amount: both "${a.debitColumn}" and "${a.creditColumn}" have amounts` };
  }
  if (debit !== null) return { cents: -debit };
  if (credit !== null) return { cents: credit };
  return { error: `Amount: both "${a.debitColumn}" and "${a.creditColumn}" are empty or zero` };
}
