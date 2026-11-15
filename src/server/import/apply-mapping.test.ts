import { expect, it } from "vitest";
import { fixture } from "@/test/fixtures";
import { applyMapping } from "./apply-mapping";
import { detectMapping } from "./detect";
import { PRESETS } from "./presets";
import { readCsv } from "./read-csv";

it("ufcu preset signs amounts by indicator and marks Pending rows", () => {
  const { rows, errors } = applyMapping(readCsv(fixture("ufcu-checking.csv")), PRESETS.ufcu.mapping);
  expect(errors).toEqual([]);
  expect(rows.map((r) => [r.date, r.amountCents, r.pending])).toEqual([
    ["2026-11-15", -2084, true], ["2026-11-14", -2164, false], ["2026-11-14", 120000, false],
    ["2026-11-13", -625, false], ["2026-11-13", -625, false], ["2026-11-12", -10000, false], ["2026-11-02", -4510, false],
  ]);
  expect(rows[5]!.description).toBe("Withdrawal Internet Banking Transfer To Share 0001 Savings");
  expect(rows[1]).toMatchObject({ bankCategory: "Bills & Utilities", accountNumber: "1800000001234" });
});

it("ally preset keeps signed amounts", () => {
  const { rows } = applyMapping(readCsv(fixture("ally-spending.csv")), PRESETS.ally.mapping);
  expect(rows.map((r) => r.amountCents)).toEqual([1, -1640, 1000, -500]);
});

it("reports bad rows by line and keeps the good ones", () => {
  const table = readCsv(fixture("generic-bad.csv"));
  const { rows, errors } = applyMapping(table, detectMapping(table).mapping!);
  expect(rows.map((r) => r.description)).toEqual(["Good One", "Good Two"]);
  expect(errors).toEqual([
    { line: 4, reason: expect.stringMatching(/Amount/) },
    { line: 5, reason: expect.stringMatching(/Date/) },
    { line: 7, reason: expect.stringMatching(/Date/) },
  ]);
});

it("split columns use whichever side is non-zero, even when the other says 0.00", () => {
  const table = {
    headers: ["Date", "Description", "Debit", "Credit"],
    rows: [
      ["2026-11-10", "Payroll", "0.00", "1200.00"],
      ["2026-11-11", "Coffee", "4.50", "0.00"],
      ["2026-11-12", "Both", "1.00", "2.00"],
      ["2026-11-13", "Neither", "0.00", ""],
    ],
    lines: [2, 3, 4, 5],
  };
  const { rows, errors } = applyMapping(table, {
    date: { column: "Date", format: "YYYY-MM-DD" },
    description: "Description",
    amount: { kind: "split", debitColumn: "Debit", creditColumn: "Credit" },
  });
  expect(rows.map((r) => [r.description, r.amountCents])).toEqual([["Payroll", 120000], ["Coffee", -450]]);
  expect(errors.map((e) => e.line)).toEqual([4, 5]);
});

it("flags rows whose column count doesn't match the header", () => {
  const table = {
    headers: ["Date", "Description", "Amount"],
    rows: [["2026-11-10", "Good", "-1.00"], ["2026-11-11", "-2.00"]],
    lines: [2, 3],
  };
  const { rows, errors } = applyMapping(table, {
    date: { column: "Date", format: "YYYY-MM-DD" },
    description: "Description",
    amount: { kind: "signed", column: "Amount" },
  });
  expect(rows).toHaveLength(1);
  expect(errors).toEqual([{ line: 3, reason: expect.stringMatching(/2 columns.*expected 3/) }]);
});

it("reports a blank or unknown debit/credit indicator instead of treating it as money in", () => {
  const table = {
    headers: ["Date", "Description", "Amount", "Indicator"],
    rows: [
      ["2026-11-10", "Fine", "5.00", "Credit"],
      ["2026-11-11", "Blank", "5.00", ""],
      ["2026-11-12", "Odd", "5.00", "Reversal"],
    ],
    lines: [2, 3, 4],
  };
  const { rows, errors } = applyMapping(table, {
    date: { column: "Date", format: "YYYY-MM-DD" },
    description: "Description",
    amount: { kind: "indicator", column: "Amount", indicatorColumn: "Indicator", debitValues: ["Debit"] },
  });
  expect(rows.map((r) => r.amountCents)).toEqual([500]);
  expect(errors).toEqual([
    { line: 3, reason: expect.stringMatching(/Indicator/) },
    { line: 4, reason: expect.stringMatching(/Indicator/) },
  ]);
});
