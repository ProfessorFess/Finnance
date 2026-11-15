import { expect, it } from "vitest";
import { normalizeMerchant } from "./normalize-merchant";

it.each([
  ["TST* HAYMAKER 2310 MANOR RD AUSTIN, TX, US", "Haymaker"],
  ["SQ *BENNU COFFEE 2001 East Martin Luther Austin, TX, US", "Bennu Coffee"],
  ["PAVEMENT - GUADALUPE 2900 GUADALUPE ST AUSTIN, TX, US", "Pavement"],
  ["TST* CHI'LANTRO BBQ - MUE 1900 BARBARA JORDAN BLV AUSTIN, TX, US", "Chi'lantro BBQ"],
  ["TARGET T-1234 5000 Austin Hwy San Antonio, TX, US", "Target"],
  ["TST* CABO BOB'S BURRITOS 123 NE INTERSTATE 410 L SAN ANTONIO, TX, US", "Cabo Bob's Burritos"],
  ["CENTRAL MARKET AUSTIN, TX, US", "Central Market"],
  ["THE DRUG STORE AUSTIN, TX, US", "The Drug Store"],
  ["Uber Eats", "Uber Eats"],
  ["Prime Video", "Prime Video"],
  ["Withdrawal Internet Banking Transfer To Share 0001 Savings", "Withdrawal Internet Banking Transfer To Share 0001 Savings"],
  ["  Interest   Paid ", "Interest Paid"],
])("normalizeMerchant(%j) -> %j", (raw, expected) => expect(normalizeMerchant(raw)).toBe(expected));
