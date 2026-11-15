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
    const isDebit = a.debitValues.some((v) => v.toLowerCase() === get(a.indicatorColumn).toLowerCase());
    return { cents: isDebit ? -Math.abs(cents) : Math.abs(cents) };
  }
  const debit = get(a.debitColumn);
  const credit = get(a.creditColumn);
  if (debit) {
    const cents = parseAmountToCents(debit);
    return cents === null ? bad(a.debitColumn) : { cents: -Math.abs(cents) };
  }
  if (credit) {
    const cents = parseAmountToCents(credit);
    return cents === null ? bad(a.creditColumn) : { cents: Math.abs(cents) };
  }
  return { error: `Amount: both "${a.debitColumn}" and "${a.creditColumn}" are empty` };
}
