import { expect, it } from "vitest";
import { fixture, fixtureBytes } from "@/test/fixtures";
import { readCsv } from "./read-csv";
import { readOfx } from "./read-ofx";
import { readXlsx } from "./read-xlsx";

it("reads the UFCU export: BOM stripped, 17 headers, multi-line description kept", () => {
  const t = readCsv(fixture("ufcu-checking.csv"));
  expect(t.headers[0]).toBe("Account number(BBAN)");
  expect(t.headers).toHaveLength(17);
  expect(t.rows).toHaveLength(7);
  expect(t.rows[5]![14]).toBe("Withdrawal Internet Banking Transfer To Share 0001\nSavings");
  expect(t.lines).toEqual([2, 3, 4, 5, 6, 7, 9]);
});

it("reads the Ally export with trimmed headers", () => {
  expect(readCsv(fixture("ally-spending.csv")).headers).toEqual(["Date", "Time", "Amount", "Type", "Description"]);
});

it("skips blank lines but keeps original line numbers", () => {
  const t = readCsv(fixture("generic-bad.csv"));
  expect(t.rows).toHaveLength(5);
  expect(t.lines).toEqual([2, 4, 5, 6, 7]);
});

it("reads XLSX dates as calendar dates", async () => {
  const t = await readXlsx(fixtureBytes("sample.xlsx"));
  expect(t.headers).toEqual(["Date", "Description", "Amount"]);
  expect(t.rows[0]).toEqual(["2026-11-10", "XLSX Coffee", "-4.75"]);
  expect(t.rows[1]).toEqual(["2026-11-11", "XLSX Refund", "10"]);
});

it("reads OFX transactions with FITIDs", () => {
  const r = readOfx(fixture("sample.ofx"));
  expect(r.accountId).toBe("0000999");
  expect(r.rows).toEqual([
    expect.objectContaining({ date: "2026-11-10", amountCents: -1234, description: "TEST MERCHANT", externalId: "A1" }),
    expect.objectContaining({ date: "2026-11-11", amountCents: 20000, description: "TEST DEPOSIT", externalId: "A2" }),
  ]);
});
