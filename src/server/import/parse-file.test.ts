import { expect, it } from "vitest";
import { fixture, fixtureBytes } from "@/test/fixtures";
import { detectMapping, headerSignature } from "./detect";
import { parseImportFile } from "./parse-file";
import { readCsv } from "./read-csv";

it("parses a UFCU file end to end with an account hint", async () => {
  const p = await parseImportFile({ name: "UFCU_Checking_Account.csv", bytes: fixtureBytes("ufcu-checking.csv") }, []);
  expect(p).toMatchObject({ source: "csv", format: { kind: "preset", id: "ufcu" }, accountHint: "1800000001234" });
  expect(p.rows).toHaveLength(7);
});

it("uses a saved profile for an unknown layout", async () => {
  const table = readCsv(fixture("generic-bad.csv"));
  const profile = { id: "p1", headerSignature: headerSignature(table.headers), mapping: detectMapping(table).mapping! };
  const p = await parseImportFile({ name: "bank.csv", bytes: fixtureBytes("generic-bad.csv") }, [profile]);
  expect(p.format).toEqual({ kind: "profile", id: "p1" });
  expect(p.rows).toHaveLength(2);
});

it("asks for mapping on a low-confidence guess", async () => {
  const p = await parseImportFile({ name: "bank.csv", bytes: fixtureBytes("generic-bad.csv") }, []);
  expect(p.format).toEqual({ kind: "detected", confidence: "low" });
  expect(p.rows).toEqual([]);
  expect(p.mapping).not.toBeNull();
});

it("parses OFX and XLSX files", async () => {
  const ofx = await parseImportFile({ name: "stmt.QFX", bytes: fixtureBytes("sample.ofx") }, []);
  expect(ofx).toMatchObject({ source: "ofx", format: { kind: "ofx" }, accountHint: "0000999" });
  expect(ofx.rows).toHaveLength(2);
  const xlsx = await parseImportFile({ name: "export.xlsx", bytes: fixtureBytes("sample.xlsx") }, []);
  expect(xlsx).toMatchObject({ source: "xlsx", format: { kind: "detected", confidence: "low" } });
});

it("rejects unsupported files", async () => {
  await expect(parseImportFile({ name: "statement.pdf", bytes: new Uint8Array() }, [])).rejects.toThrow(/CSV, XLSX, or OFX/);
});

it("rejects a file with a broken quote instead of silently dropping the rows after it", async () => {
  const text = [
    "Date, Time, Amount, Type, Description",
    "2026-11-09,12:00:00,-1.00,Withdrawal,Fine",
    '2026-11-10,12:00:00,-2.00,Withdrawal,"Broken desc',
    "2026-11-11,12:00:00,-3.00,Withdrawal,Swallowed one",
    "2026-11-12,12:00:00,-4.00,Withdrawal,Swallowed two",
  ].join("\n");
  await expect(parseImportFile({ name: "ally.csv", bytes: new TextEncoder().encode(text) }, [])).rejects.toThrow(/quote.*line 3/i);
});
