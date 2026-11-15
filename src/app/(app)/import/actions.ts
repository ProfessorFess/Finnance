"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import { ImportError } from "@/server/import/errors";
import { commitImport, type ImportPreview, type ImportResult, previewImport, undoImport } from "@/server/import/service";
import type { ColumnMapping } from "@/server/import/types";

type Failure = { error: string };

const dateFormat = z.enum(["YYYY-MM-DD", "MM/DD/YYYY", "M/D/YYYY", "DD/MM/YYYY"]);
const mappingSchema: z.ZodType<ColumnMapping> = z.object({
  date: z.object({ column: z.string(), format: dateFormat }),
  description: z.string(),
  amount: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("signed"), column: z.string(), invert: z.boolean().optional() }),
    z.object({ kind: z.literal("indicator"), column: z.string(), indicatorColumn: z.string(), debitValues: z.array(z.string()) }),
    z.object({ kind: z.literal("split"), debitColumn: z.string(), creditColumn: z.string() }),
  ]),
  pending: z.object({ column: z.string(), values: z.array(z.string()) }).optional(),
  bankCategory: z.string().optional(),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
});

async function readFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ImportError("Choose a file to import");
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

function readMapping(formData: FormData): ColumnMapping | undefined {
  const raw = formData.get("mapping");
  if (typeof raw !== "string" || !raw) return undefined;
  const parsed = mappingSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new ImportError("Those column choices aren't complete");
  return parsed.data;
}

function toFailure(err: unknown): Failure {
  if (err instanceof ImportError || err instanceof NotFoundError || err instanceof ValidationError) return { error: err.message };
  if (err instanceof SyntaxError) return { error: "Those column choices aren't complete" };
  throw err;
}

/** Reads one file and reports what importing it would do. */
export async function previewFile(formData: FormData): Promise<ImportPreview | Failure> {
  const user = await requireUser();
  try {
    return await previewImport(getDb(), user.id, await readFile(formData), readMapping(formData));
  } catch (err) {
    return toFailure(err);
  }
}

/** Imports one file into the chosen account. */
export async function importFile(formData: FormData): Promise<ImportResult | Failure> {
  const user = await requireUser();
  try {
    const accountId = z.string().min(1).parse(formData.get("accountId"));
    const result = await commitImport(getDb(), user.id, {
      file: await readFile(formData),
      accountId,
      mapping: readMapping(formData),
    });
    revalidatePath("/import");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return result;
  } catch (err) {
    if (err instanceof z.ZodError) return { error: "Choose an account for this file" };
    return toFailure(err);
  }
}

/** Removes everything one import added. */
export async function undoBatch(batchId: string): Promise<{ removed: number } | Failure> {
  const user = await requireUser();
  try {
    const res = await undoImport(getDb(), user.id, z.string().parse(batchId));
    revalidatePath("/import");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return res;
  } catch (err) {
    return toFailure(err);
  }
}
