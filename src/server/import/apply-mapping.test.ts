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
