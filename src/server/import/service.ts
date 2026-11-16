import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { accounts, importBatches, importProfiles, transactions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { NotFoundError } from "@/server/finance/errors";
import { getSettings } from "@/server/finance/settings";
import { normalizeMerchant } from "@/server/categorize/normalize-merchant";
import type { AiCategorizer } from "@/server/categorize/ai-categorizer";
import { categorizeTransactions } from "@/server/categorize/pipeline";
import { clearDanglingPairs, detectTransfers } from "@/server/categorize/transfers-service";
import { restoreLoggedIncome, supersedeLoggedIncome } from "@/server/recurring/log-income";
import { matchRecurring } from "@/server/recurring/matching-service";
import { creditGoals } from "@/server/goals/credit-service";
import { assignOccurrences, dedupeHash } from "./dedupe";
import { headerSignature } from "./detect";
import { ImportError } from "./errors";
import { type ParsedFile, parseImportFile, type SavedProfile } from "./parse-file";
import { PRESETS } from "./presets";
import type { ColumnMapping, ParsedRow, RowError } from "./types";

export type ImportFile = { name: string; bytes: Uint8Array };
export type ImportCounts = { rows: number; pending: number; beforeStart: number; errors: number; ready: number };
export type ImportPreview = {
  fileName: string;
  formatLabel: string;
  needsMapping: boolean;
  headers: string[];
  mapping: ColumnMapping | null;
  suggestedAccountId: string | null;
  counts: ImportCounts;
  sample: ParsedRow[];
  errors: RowError[];
};
export type ImportResult = {
  batchId: string;
  imported: number;
  duplicates: number;
  pending: number;
  beforeStart: number;
  errors: RowError[];
  /** Transfer pairs matched after this import. */
  transfers: number;
  /** Rows linked to a paycheck, bill, or subscription. */
  matched: number;
  /** Hand-logged income replaced by the bank's record of the same deposit. */
  replacedLogged: number;
  /** Imported rows that still need the user's review. */
  needsReview: number;
};
export type ImportBatchSummary = {
  id: string;
  fileName: string;
  accountId: string;
  accountName: string;
  importedCount: number;
  duplicateCount: number;
  createdAt: Date;
  undoneAt: Date | null;
};

const CHUNK = 500;

async function requireStartDate(db: Database, userId: string): Promise<string> {
  const { trackingStartDate } = await getSettings(db, userId);
  if (!trackingStartDate) throw new ImportError("Set your tracking start date first");
  return trackingStartDate;
}

async function loadProfiles(db: Database, userId: string): Promise<SavedProfile[]> {
  const rows = await db.select().from(importProfiles).where(eq(importProfiles.userId, userId));
  return rows.map((p) => ({ id: p.id, headerSignature: p.headerSignature, mapping: p.mapping as ColumnMapping }));
}

function needsMapping(parsed: ParsedFile, mapping?: ColumnMapping): boolean {
  if (mapping) return false;
  return parsed.format.kind === "unknown" || (parsed.format.kind === "detected" && parsed.format.confidence === "low");
}

function formatLabel(parsed: ParsedFile): string {
  switch (parsed.format.kind) {
    case "preset":
      return parsed.format.label;
    case "profile":
      return "Saved format";
    case "ofx":
      return "OFX file";
    case "detected":
      return parsed.format.confidence === "high" ? "Custom columns" : "Unrecognized layout";
    default:
      return "Unrecognized layout";
  }
}

/** Splits parsed rows into what will import and what's skipped, by rule. */
function classify(parsed: ParsedFile, startDate: string) {
  const ready: ParsedRow[] = [];
  let pending = 0;
  let beforeStart = 0;
  for (const r of parsed.rows) {
    if (r.pending) pending++;
    else if (r.date < startDate) beforeStart++;
    else ready.push(r);
  }
  const counts: ImportCounts = {
    rows: parsed.rows.length + parsed.errors.length,
    pending,
    beforeStart,
    errors: parsed.errors.length,
    ready: ready.length,
  };
  return { ready, counts };
}

/**
 * Picks the most likely account for a file. Account-number digits narrow it
 * first (but two accounts can share last four digits, as UFCU's do), then
 * words from the file's own account label and file name ("checking",
 * "savings", "spending"), then "the only account at that bank".
 */
export function suggestAccount(
  list: { id: string; name: string; type?: string; lastFour: string | null; institution: string | null }[],
  parsed: { accountHint: string | null; accountLabel?: string | null; format: ParsedFile["format"] },
  fileName: string,
): string | null {
  const words = `${parsed.accountLabel ?? ""} ${fileName}`.toLowerCase().match(/checking|savings|spending/g) ?? [];
  const byWords = (candidates: typeof list) =>
    candidates.filter((a) =>
      words.some((w) => a.name.toLowerCase().includes(w) || a.type === w || (w === "spending" && a.type === "checking")),
    );

  const hint = parsed.accountHint?.replace(/\D/g, "") ?? "";
  if (hint.length >= 4) {
    const byDigits = list.filter((a) => a.lastFour === hint.slice(-4));
    // When the file names its account type, it must agree with the digit match:
    // shared last-four digits would otherwise send a savings file to checking.
    const agreed = words.length > 0 ? byWords(byDigits) : byDigits;
    if (agreed.length === 1) return agreed[0]!.id;
  }
  if (parsed.format.kind !== "preset") return null;
  const institution = PRESETS[parsed.format.id].institution.toLowerCase();
  const atBank = list.filter((a) => a.institution?.toLowerCase() === institution);
  const named = byWords(atBank);
  if (named.length === 1) return named[0]!.id;
  return atBank.length === 1 ? atBank[0]!.id : null;
}

/** Reads a file and reports what an import would do, without writing anything. */
export async function previewImport(
  db: Database,
  userId: string,
  file: ImportFile,
  mapping?: ColumnMapping,
): Promise<ImportPreview> {
  const startDate = await requireStartDate(db, userId);
  const parsed = await parseImportFile(file, await loadProfiles(db, userId), mapping);
  const { ready, counts } = classify(parsed, startDate);
  const list = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), isNull(accounts.archivedAt)));
  return {
    fileName: file.name,
    formatLabel: formatLabel(parsed),
    needsMapping: needsMapping(parsed, mapping),
    headers: parsed.table?.headers ?? [],
    mapping: parsed.mapping,
    suggestedAccountId: suggestAccount(list, parsed, file.name),
    counts,
    sample: ready.slice(0, 5),
    errors: parsed.errors.slice(0, 20),
  };
}

/**
 * Imports a file into an account: skips pending rows, rows before the start
 * date, unreadable rows, and anything already imported (unique dedupe hash).
 * One DB transaction: batch record, rows, saved profile, learned last four,
 * and an activity entry.
 */
export async function commitImport(
  db: Database,
  userId: string,
  input: { file: ImportFile; accountId: string; mapping?: ColumnMapping },
  deps: { ai: AiCategorizer | null } = { ai: null },
): Promise<ImportResult> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)));
  if (!account) throw new NotFoundError("Account");
  const startDate = await requireStartDate(db, userId);
  const parsed = await parseImportFile(input.file, await loadProfiles(db, userId), input.mapping);
  if (needsMapping(parsed, input.mapping)) throw new ImportError("Choose how to read this file's columns");

  const { ready, counts } = classify(parsed, startDate);
  const rows = assignOccurrences(ready).map((r) => ({
    userId,
    accountId: account.id,
    date: r.date,
    amountCents: r.amountCents,
    rawDescription: r.description,
    merchant: normalizeMerchant(r.description),
    source: parsed.source,
    externalId: r.externalId,
    dedupeHash: dedupeHash(account.id, r, r.occurrence),
    bankCategory: r.bankCategory,
  }));

  const committed = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(importBatches)
      .values({
        userId,
        accountId: account.id,
        fileName: input.file.name,
        importedCount: 0,
        duplicateCount: 0,
        pendingCount: counts.pending,
        beforeStartCount: counts.beforeStart,
        errorCount: counts.errors,
      })
      .returning({ id: importBatches.id });

    const insertedIds: string[] = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const inserted = await tx
        .insert(transactions)
        .values(rows.slice(i, i + CHUNK).map((r) => ({ ...r, importBatchId: batch!.id })))
        .onConflictDoNothing({ target: [transactions.accountId, transactions.dedupeHash] })
        .returning({ id: transactions.id });
      insertedIds.push(...inserted.map((x) => x.id));
    }
    const imported = insertedIds.length;
    const duplicates = rows.length - imported;
    await tx.update(importBatches).set({ importedCount: imported, duplicateCount: duplicates }).where(eq(importBatches.id, batch!.id));

    // Only remember a layout that actually read some rows; a wrong guess that
    // imported nothing must not become the silent default for next time.
    if (input.mapping && parsed.table && rows.length > 0) {
      await tx
        .insert(importProfiles)
        .values({
          userId,
          name: input.file.name,
          headerSignature: headerSignature(parsed.table.headers),
          mapping: input.mapping,
          defaultAccountId: account.id,
        })
        .onConflictDoUpdate({
          target: [importProfiles.userId, importProfiles.headerSignature],
          set: { mapping: input.mapping, defaultAccountId: account.id },
        });
    }

    const digits = parsed.accountHint?.replace(/\D/g, "") ?? "";
    if (!account.lastFour && digits.length >= 4) {
      await tx.update(accounts).set({ lastFour: digits.slice(-4) }).where(eq(accounts.id, account.id));
    }

    const result = { batchId: batch!.id, imported, duplicates, pending: counts.pending, beforeStart: counts.beforeStart, errors: parsed.errors, insertedIds };
    await logActivity(tx, {
      userId,
      actor: "user",
      action: "import.commit",
      entityType: "import_batch",
      entityId: batch!.id,
      after: { fileName: input.file.name, accountId: account.id, imported, duplicates, pending: counts.pending, beforeStart: counts.beforeStart, errors: counts.errors },
    });
    return result;
  });

  const { insertedIds, ...result } = committed;
  let transfers = 0;
  let matched = 0;
  let replacedLogged = 0;
  if (insertedIds.length > 0) {
    // Sorting runs after the rows are safely committed; a failure here never undoes the import.
    const dates = rows.map((r) => r.date).sort();
    try {
      transfers = await detectTransfers(db, userId, { from: dates[0]!, to: dates[dates.length - 1]! });
    } catch (err) {
      console.error("Transfer detection failed", err instanceof Error ? err.message : err);
    }
    try {
      await categorizeTransactions(db, userId, { ids: insertedIds }, { ai: deps.ai });
    } catch (err) {
      console.error("Categorization failed", err instanceof Error ? err.message : err);
      await db
        .update(transactions)
        .set({ needsReview: true })
        .where(and(eq(transactions.userId, userId), inArray(transactions.id, insertedIds), isNull(transactions.categorizationSource)));
    }
    try {
      // The bank's record replaces income logged by hand for the same deposit.
      replacedLogged = await supersedeLoggedIncome(db, userId, insertedIds);
    } catch (err) {
      console.error("Replacing logged income failed", err instanceof Error ? err.message : err);
    }
    try {
      matched = await matchRecurring(db, userId, { from: dates[0]!, to: dates[dates.length - 1]! });
    } catch (err) {
      console.error("Recurring matching failed", err instanceof Error ? err.message : err);
    }
    try {
      await creditGoals(db, userId);
    } catch (err) {
      console.error("Crediting goals failed", err instanceof Error ? err.message : err);
    }
  }
  const needsReview = insertedIds.length
    ? (
        await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), inArray(transactions.id, insertedIds), eq(transactions.needsReview, true)))
      ).length
    : 0;
  return { ...result, transfers, needsReview, matched, replacedLogged };
}

/** Removes everything one import added. */
export async function undoImport(db: Database, userId: string, batchId: string): Promise<{ removed: number }> {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)));
  if (!batch) throw new NotFoundError("Import");
  if (batch.undoneAt) throw new ImportError("Already undone");

  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(transactions)
      .where(and(eq(transactions.importBatchId, batchId), eq(transactions.userId, userId)))
      .returning({ id: transactions.id });
    await tx.update(importBatches).set({ undoneAt: new Date() }).where(eq(importBatches.id, batchId));
    await clearDanglingPairs(tx, userId);
    await restoreLoggedIncome(tx, userId, removed.map((r) => r.id));
    await logActivity(tx, {
      userId,
      actor: "user",
      action: "import.undo",
      entityType: "import_batch",
      entityId: batchId,
      before: { imported: batch.importedCount },
      after: { removed: removed.length },
    });
    return { removed: removed.length };
  });
}

/** Recent imports, newest first. */
export async function listImportBatches(db: Database, userId: string, limit = 10): Promise<ImportBatchSummary[]> {
  return db
    .select({
      id: importBatches.id,
      fileName: importBatches.fileName,
      accountId: importBatches.accountId,
      accountName: accounts.name,
      importedCount: importBatches.importedCount,
      duplicateCount: importBatches.duplicateCount,
      createdAt: importBatches.createdAt,
      undoneAt: importBatches.undoneAt,
    })
    .from(importBatches)
    .innerJoin(accounts, eq(accounts.id, importBatches.accountId))
    .where(eq(importBatches.userId, userId))
    .orderBy(desc(importBatches.createdAt))
    .limit(limit);
}
