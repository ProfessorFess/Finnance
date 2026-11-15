import { expect, it } from "vitest";
import { fixture } from "@/test/fixtures";
import { detectMapping } from "./detect";
import { readCsv } from "./read-csv";

it("recognizes UFCU and Ally exports by header", () => {
  expect(detectMapping(readCsv(fixture("ufcu-checking.csv")))).toMatchObject({ preset: "ufcu", confidence: "high" });
  expect(detectMapping(readCsv(fixture("ally-spending.csv")))).toMatchObject({ preset: "ally", confidence: "high" });
});

it("guesses a generic layout with low confidence", () => {
  const d = detectMapping(readCsv(fixture("generic-bad.csv")));
  expect(d).toMatchObject({ preset: null, confidence: "low" });
  expect(d.mapping).toEqual({
    date: { column: "Date", format: "YYYY-MM-DD" },
    description: "Description",
    amount: { kind: "signed", column: "Amount" },
  });
});

it("detects debit/credit column pairs", () => {
  const d = detectMapping({ headers: ["Posted Date", "Payee", "Debit", "Credit"], rows: [["11/10/2026", "X", "5.00", ""]], lines: [2] });
  expect(d.mapping?.amount).toEqual({ kind: "split", debitColumn: "Debit", creditColumn: "Credit" });
  expect(d.mapping?.date.format).toBe("MM/DD/YYYY");
});

it("gives up without a date column", () => {
  expect(detectMapping({ headers: ["Foo", "Bar"], rows: [["a", "b"]], lines: [2] }).mapping).toBeNull();
});
