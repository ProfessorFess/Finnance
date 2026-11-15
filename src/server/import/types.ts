import type { DateFormat } from "@/lib/dates";

export type { DateFormat };

/** How a file says which way money moved. */
export type AmountMapping =
  | { kind: "signed"; column: string; invert?: boolean }
  | { kind: "indicator"; column: string; indicatorColumn: string; debitValues: string[] }
  | { kind: "split"; debitColumn: string; creditColumn: string };

/** Which columns hold what, by header name. Saved per bank layout as an import profile. */
export type ColumnMapping = {
  date: { column: string; format: DateFormat };
  description: string;
  amount: AmountMapping;
  pending?: { column: string; values: string[] };
  bankCategory?: string;
  accountNumber?: string;
  /** Column naming the account (e.g. UFCU's "FREE CHECKING"), used to pick the right account. */
  accountName?: string;
};

/** One transaction read from a file, before any import decisions. */
export type ParsedRow = {
  line: number;
  date: string;
  amountCents: number;
  description: string;
  pending: boolean;
  bankCategory: string | null;
  accountNumber: string | null;
  externalId: string | null;
};

export type RowError = { line: number; reason: string };

/** A tabular file. `lines[i]` is the original 1-based file line where `rows[i]` starts. */
export type Table = { headers: string[]; rows: string[][]; lines: number[]; problems?: RowError[] };
