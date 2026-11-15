import { applyMapping } from "./apply-mapping";
import { detectMapping, headerSignature } from "./detect";
import { ImportError } from "./errors";
import { PRESETS, type PresetId } from "./presets";
import { readCsv } from "./read-csv";
import { readOfx } from "./read-ofx";
import { readXlsx } from "./read-xlsx";
import type { ColumnMapping, ParsedRow, RowError, Table } from "./types";

export type SavedProfile = { id: string; headerSignature: string; mapping: ColumnMapping };

export type FileFormat =
  | { kind: "preset"; id: PresetId; label: string }
  | { kind: "profile"; id: string }
  | { kind: "detected"; confidence: "high" | "low" }
  | { kind: "ofx" }
  | { kind: "unknown" };

export type ParsedFile = {
  source: "csv" | "xlsx" | "ofx";
  format: FileFormat;
  table: Table | null;
  mapping: ColumnMapping | null;
  accountHint: string | null;
  /** The file's own name for the account, when it has one (UFCU: "REGULAR SAVINGS"). */
  accountLabel: string | null;
  rows: ParsedRow[];
  errors: RowError[];
};

function sourceOf(name: string): ParsedFile["source"] {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "csv") return "csv";
  if (ext === "xlsx") return "xlsx";
  if (ext === "ofx" || ext === "qfx") return "ofx";
  throw new ImportError("Unsupported file type: use CSV, XLSX, or OFX");
}

/**
 * Reads a bank export and works out how to interpret it. Precedence: built-in
 * preset, then a saved profile with the same headers, then a heuristic guess.
 * Rows are only produced when the layout is known; a guess (or nothing) returns
 * no rows so the user can confirm the columns first. An explicit `mapping`
 * overrides detection (the user confirmed it).
 */
export async function parseImportFile(
  file: { name: string; bytes: Uint8Array },
  profiles: SavedProfile[],
  mapping?: ColumnMapping,
): Promise<ParsedFile> {
  const source = sourceOf(file.name);

  if (source === "ofx") {
    const ofx = readOfx(new TextDecoder().decode(file.bytes));
    return { source, format: { kind: "ofx" }, table: null, mapping: null, accountHint: ofx.accountId, accountLabel: null, rows: ofx.rows, errors: ofx.errors };
  }

  const table = source === "csv" ? readCsv(new TextDecoder().decode(file.bytes)) : await readXlsx(file.bytes);
  const problem = table.problems?.[0];
  if (problem) {
    // A broken quote makes the CSV parser swallow everything after it into one cell,
    // so importing "the rest" would silently lose rows. Refuse the file instead.
    throw new ImportError(
      `This file has a broken quote near line ${problem.line}, so it can't be read safely. Try downloading it again from your bank.`,
    );
  }
  const detected = detectMapping(table);
  const profile = profiles.find((p) => p.headerSignature === headerSignature(table.headers));

  let format: FileFormat;
  let chosen: ColumnMapping | null;
  let usable: boolean;
  if (mapping) {
    format = profile ? { kind: "profile", id: profile.id } : { kind: "detected", confidence: "high" };
    chosen = mapping;
    usable = true;
  } else if (detected.preset) {
    format = { kind: "preset", id: detected.preset, label: PRESETS[detected.preset].label };
    chosen = detected.mapping;
    usable = true;
  } else if (profile) {
    format = { kind: "profile", id: profile.id };
    chosen = profile.mapping;
    usable = true;
  } else if (detected.mapping) {
    format = { kind: "detected", confidence: detected.confidence };
    chosen = detected.mapping;
    usable = detected.confidence === "high";
  } else {
    format = { kind: "unknown" };
    chosen = null;
    usable = false;
  }

  if (!usable || !chosen) return { source, format, table, mapping: chosen, accountHint: null, accountLabel: null, rows: [], errors: [] };
  const { rows, errors } = applyMapping(table, chosen);
  const labelIndex = chosen.accountName === undefined ? -1 : table.headers.indexOf(chosen.accountName);
  const accountLabel = labelIndex >= 0 ? (table.rows.find((r) => r[labelIndex]?.trim())?.[labelIndex]?.trim() ?? null) : null;
  return {
    source, format, table, mapping: chosen,
    accountHint: rows.find((r) => r.accountNumber)?.accountNumber ?? null,
    accountLabel, rows, errors,
  };
}
