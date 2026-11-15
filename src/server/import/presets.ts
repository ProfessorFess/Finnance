import type { ColumnMapping } from "./types";

export type PresetId = "ufcu" | "ally";

const UFCU_HEADERS = [
  "Account number(BBAN)", "Account name", "Counter party account number", "Counter party name", "Currency",
  "Amount", "Credit/debit indicator", "Book date", "Transaction type", "Transaction group",
  "Transaction reference", "Instructed currency", "currency exchange rate", "Instructed amount",
  "Description", "Category", "Check number",
];
const ALLY_HEADERS = ["Date", "Time", "Amount", "Type", "Description"];

const signature = (headers: string[]) => headers.map((h) => h.trim().toLowerCase()).join("|");

/** Built-in layouts for the owner's banks, matched by exact header signature. */
export const PRESETS: Record<PresetId, { label: string; institution: string; signature: string; mapping: ColumnMapping }> = {
  ufcu: {
    label: "UFCU export",
    institution: "UFCU",
    signature: signature(UFCU_HEADERS),
    mapping: {
      date: { column: "Book date", format: "MM/DD/YYYY" },
      description: "Description",
      amount: { kind: "indicator", column: "Amount", indicatorColumn: "Credit/debit indicator", debitValues: ["Debit"] },
      pending: { column: "Transaction type", values: ["Pending"] },
      bankCategory: "Category",
      accountNumber: "Account number(BBAN)",
    },
  },
  ally: {
    label: "Ally export",
    institution: "Ally",
    signature: signature(ALLY_HEADERS),
    mapping: {
      date: { column: "Date", format: "YYYY-MM-DD" },
      description: "Description",
      amount: { kind: "signed", column: "Amount" },
    },
  },
};
