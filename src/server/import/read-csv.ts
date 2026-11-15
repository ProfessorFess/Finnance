import Papa from "papaparse";
import type { Table } from "./types";

/**
 * Reads a CSV export. Strips a UTF-8 BOM, trims header names (Ally pads them
 * with spaces), keeps quoted multi-line fields, drops blank rows, and records
 * the original file line each row starts on so errors can point at it.
 */
export function readCsv(text: string): Table {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const parsed: { data: string[]; start: number; errors: string[] }[] = [];
  let prevEnd = 0;
  Papa.parse<string[]>(src, {
    header: false,
    skipEmptyLines: false,
    step: (result) => {
      parsed.push({ data: result.data, start: prevEnd, errors: result.errors.map((e) => e.message) });
      prevEnd = result.meta.cursor;
    },
  });

  // Line number of each row's first character, counting newlines incrementally.
  let line = 1;
  let pos = 0;
  const lineAt = (index: number) => {
    for (; pos < index; pos++) if (src[pos] === "\n") line++;
    return line;
  };

  const out: Table = { headers: [], rows: [], lines: [] };
  parsed.forEach(({ data, start, errors }, i) => {
    let s = start;
    while (s < src.length && (src[s] === "\n" || src[s] === "\r")) s++;
    const rowLine = lineAt(s);
    for (const reason of errors) (out.problems ??= []).push({ line: rowLine, reason });
    if (data.every((f) => f.trim() === "")) return;
    if (i === 0 || out.headers.length === 0) {
      out.headers = data.map((h) => h.trim());
      return;
    }
    out.rows.push(data);
    out.lines.push(rowLine);
  });
  return out;
}
