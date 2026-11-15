import { parseAmountToCents } from "@/lib/money";
import type { ParsedRow, RowError } from "./types";

/** Value of an OFX tag in SGML (`<TAG>value`) or XML (`<TAG>value</TAG>`) form. */
function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  return m ? m[1]!.trim() : null;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/**
 * Reads an OFX/QFX statement. One row per <STMTTRN>; FITID becomes the
 * external id, so re-imports dedupe exactly.
 */
export function readOfx(text: string): { accountId: string | null; rows: ParsedRow[]; errors: RowError[] } {
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);

  blocks.forEach((raw, i) => {
    const block = raw.split(/<\/STMTTRN>/i)[0]!;
    const index = i + 1;
    const posted = tag(block, "DTPOSTED");
    const amount = tag(block, "TRNAMT");
    const date = posted && /^\d{8}/.test(posted) ? `${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}` : null;
    const cents = amount === null ? null : parseAmountToCents(amount);
    if (!date) return errors.push({ line: index, reason: `Transaction ${index}: missing or invalid DTPOSTED date` });
    if (cents === null) return errors.push({ line: index, reason: `Transaction ${index}: missing or invalid TRNAMT amount` });
    const name = tag(block, "NAME");
    const memo = tag(block, "MEMO");
    rows.push({
      line: index,
      date,
      amountCents: cents,
      description: decode([name, memo].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()),
      pending: false,
      bankCategory: null,
      accountNumber: null,
      externalId: tag(block, "FITID"),
    });
  });

  return { accountId: tag(text, "ACCTID"), rows, errors };
}
