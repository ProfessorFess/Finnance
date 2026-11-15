/**
 * Regenerates src/server/import/__fixtures__/sample.xlsx (synthetic data only).
 *   pnpm tsx scripts/make-xlsx-fixture.ts
 */
import writeXlsxFile from "write-excel-file/node";

const date = (iso: string) => ({ type: Date, value: new Date(`${iso}T00:00:00Z`), format: "yyyy-mm-dd" });

async function main() {
  await writeXlsxFile([
  [{ value: "Date" }, { value: "Description" }, { value: "Amount" }],
  [date("2026-11-10"), { value: "XLSX Coffee" }, { type: Number, value: -4.75 }],
  [date("2026-11-11"), { value: "XLSX Refund" }, { type: Number, value: 10 }],
]).toFile("src/server/import/__fixtures__/sample.xlsx");
  console.log("wrote src/server/import/__fixtures__/sample.xlsx");
}

void main();
