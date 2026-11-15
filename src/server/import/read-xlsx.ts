import { readSheet } from "read-excel-file/node";
import type { Table } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) {
    // Excel dates carry no timezone; read-excel-file gives them as UTC midnight.
    return `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())}`;
  }
  return String(cell);
}

/** Reads the first sheet of an Excel file as a table (row 1 = headers). */
export async function readXlsx(bytes: Uint8Array): Promise<Table> {
  const sheet = await readSheet(Buffer.from(bytes));
  const out: Table = { headers: [], rows: [], lines: [] };
  sheet.forEach((cells, i) => {
    const row = cells.map(cellToString);
    if (row.every((c) => c.trim() === "")) return;
    if (out.headers.length === 0) {
      out.headers = row.map((h) => h.trim());
      return;
    }
    out.rows.push(row);
    out.lines.push(i + 1);
  });
  return out;
}
