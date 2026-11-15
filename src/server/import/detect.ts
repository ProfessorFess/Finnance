import { type DateFormat, parseDateValue } from "@/lib/dates";
import { parseAmountToCents } from "@/lib/money";
import { PRESETS, type PresetId } from "./presets";
import type { AmountMapping, ColumnMapping, Table } from "./types";

/** Normalized header list used to recognize a layout (presets and saved profiles). */
export function headerSignature(headers: string[]): string {
  return headers.map((h) => h.trim().toLowerCase()).join("|");
}

const DATE_FORMATS: DateFormat[] = ["YYYY-MM-DD", "MM/DD/YYYY", "M/D/YYYY", "DD/MM/YYYY"];
const DESCRIPTION_RE = /description|memo|payee|name|merchant|details/i;
const DEBIT_WORDS = new Set(["debit", "dr"]);
const CREDIT_WORDS = new Set(["credit", "cr"]);

export type Detection = { preset: PresetId | null; mapping: ColumnMapping | null; confidence: "high" | "low" };

function columnValues(table: Table, index: number, limit = 20): string[] {
  return table.rows
    .slice(0, limit)
    .map((r) => (r[index] ?? "").trim())
    .filter(Boolean);
}

/** The format that parses the most sample values (ties go to the earlier, US-first format). */
function inferDateFormat(values: string[]): DateFormat | null {
  let best: DateFormat | null = null;
  let bestCount = 0;
  for (const f of DATE_FORMATS) {
    const count = values.filter((v) => parseDateValue(v, f) !== null).length;
    if (count > bestCount) {
      best = f;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Recognizes a file's layout: an exact preset match is high confidence;
 * otherwise a header/value heuristic produces a low-confidence guess for the
 * user to confirm, or null when there's no usable date or amount.
 */
export function detectMapping(table: Table): Detection {
  const sig = headerSignature(table.headers);
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    if (PRESETS[id].signature === sig) return { preset: id, mapping: PRESETS[id].mapping, confidence: "high" };
  }

  const headers = table.headers;
  const find = (re: RegExp, exclude: string[] = []) => headers.find((h) => re.test(h) && !exclude.includes(h));

  let date: ColumnMapping["date"] | null = null;
  for (const h of headers.filter((x) => /date/i.test(x))) {
    const format = inferDateFormat(columnValues(table, headers.indexOf(h)));
    if (format) {
      date = { column: h, format };
      break;
    }
  }
  if (!date) return { preset: null, mapping: null, confidence: "low" };

  let amount: AmountMapping | null = null;
  const amountCol = find(/amount/i);
  if (amountCol) {
    const indicator = headers.find((h, i) => {
      if (h === amountCol || h === date!.column) return false;
      const vals = columnValues(table, i).map((v) => v.toLowerCase());
      return vals.length > 0 && vals.every((v) => DEBIT_WORDS.has(v) || CREDIT_WORDS.has(v));
    });
    if (indicator) {
      const raw = columnValues(table, headers.indexOf(indicator));
      const debitValues = [...new Set(raw.filter((v) => DEBIT_WORDS.has(v.toLowerCase())))];
      amount = { kind: "indicator", column: amountCol, indicatorColumn: indicator, debitValues: debitValues.length ? debitValues : ["Debit"] };
    } else {
      amount = { kind: "signed", column: amountCol };
    }
  } else {
    const debit = find(/debit|withdrawal|money out/i);
    const credit = find(/credit|deposit|money in/i, debit ? [debit] : []);
    if (debit && credit) amount = { kind: "split", debitColumn: debit, creditColumn: credit };
  }
  if (!amount) return { preset: null, mapping: null, confidence: "low" };

  const used = new Set([date.column, amountCol, ...(amount.kind === "split" ? [amount.debitColumn, amount.creditColumn] : []),
    ...(amount.kind === "indicator" ? [amount.indicatorColumn] : [])]);
  const description =
    headers.find((h) => DESCRIPTION_RE.test(h) && !used.has(h)) ??
    headers.find((h, i) => !used.has(h) && columnValues(table, i).some((v) => parseAmountToCents(v) === null));
  if (!description) return { preset: null, mapping: null, confidence: "low" };

  return { preset: null, mapping: { date, description, amount }, confidence: "low" };
}
