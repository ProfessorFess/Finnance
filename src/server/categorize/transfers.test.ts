import { expect, it } from "vitest";
import { isTransferLike, pairTransfers } from "./transfers";

const row = (id: string, accountId: string, date: string, amountCents: number, description: string) => ({ id, accountId, date, amountCents, description });

it("recognizes transfer-looking descriptions", () => {
  expect(isTransferLike("Withdrawal Internet Banking Transfer To Share 0080")).toBe(true);
  expect(isTransferLike("Zelle payment from A SAMPLE to A Sample")).toBe(true);
  expect(isTransferLike("Internet transfer to Spending account XXXXXX0000")).toBe(true);
  expect(isTransferLike("Harris County Toll Road Authority")).toBe(false);
});

it("pairs a same-day Zelle to yourself across banks", () => {
  expect(pairTransfers([
    row("o", "ufcu", "2026-11-03", -5000, "Zelle transfer to A SAMPLE"),
    row("i", "ally", "2026-11-03", 5000, "Zelle payment from A SAMPLE to A Sample (Ally Spending Account XXXXXX0000)"),
  ])).toEqual([["o", "i"]]);
});

it("does not pair a purchase with a coincidental equal transfer", () => {
  expect(pairTransfers([
    row("toll", "ufcu", "2026-11-03", -1240, "Harris County Toll Road Authority"),
    row("z", "ally", "2026-11-05", 1240, "Zelle payment from A SAMPLE to A Sample"),
  ])).toEqual([]);
});

it("pairs repeated equal transfers one-to-one by nearest date", () => {
  const out = ["2026-11-01", "2026-11-08"].map((d, k) => row(`o${k}`, "sav", d, -10000, "Withdrawal Internet Banking Transfer To Share 0080"));
  const inn = ["2026-11-08", "2026-11-01"].map((d, k) => row(`i${k}`, "chk", d, 10000, "Deposit Internet Banking Transfer From Share 0001"));
  expect(pairTransfers([...out, ...inn])).toEqual([["o0", "i1"], ["o1", "i0"]]);
});

it("never pairs within one account or beyond 5 days", () => {
  expect(pairTransfers([row("o", "a", "2026-11-01", -100, "Transfer To Share 01"), row("i", "a", "2026-11-01", 100, "Transfer From Share 01")])).toEqual([]);
  expect(pairTransfers([row("o", "a", "2026-11-01", -100, "Transfer To Share 01"), row("i", "b", "2026-11-07", 100, "Transfer From Share 01")])).toEqual([]);
});

it("does not pair Zelle payments with two different people", () => {
  expect(pairTransfers([
    row("o", "ufcu", "2026-11-03", -4000, "Zelle transfer to NATHAN KINNAMAN"),
    row("i", "ally", "2026-11-05", 4000, "Zelle payment from TAJA ROGERS to A Sample (Ally Spending Account XXXXXX0000)"),
  ])).toEqual([]);
});

it("pairs your own Zelle even when one bank adds a middle initial", () => {
  expect(pairTransfers([
    row("o", "ally", "2026-11-03", -2500, "Zelle payment from Alex Q Sample (Ally Spending Account XXXXXX0000) to ALEX SAMPLE"),
    row("i", "ufcu", "2026-11-04", 2500, "Zelle transfer from ALEX SAMPLE"),
  ])).toEqual([["o", "i"]]);
});

it("does not pair a Zelle with a non-Zelle transfer", () => {
  expect(pairTransfers([
    row("o", "ufcu", "2026-11-03", -5000, "Withdrawal Internet Banking Transfer To Share 0080"),
    row("i", "ally", "2026-11-03", 5000, "Zelle payment from TAJA ROGERS to A Sample"),
  ])).toEqual([]);
});
