import type { RecurringKind } from "@/server/db/finance-schema";
import type { Frequency } from "@/server/recurring/schedule";
import type { AmountBasis, ItemState } from "@/server/recurring/status";
import type { ItemDraft } from "./item-dialog";

/** One recurring item as the page shows it (serializable). */
export type ItemCardView = {
  key: string;
  name: string;
  kind: "income" | RecurringKind;
  frequency: Frequency;
  amountCents: number | null;
  amountBasis: AmountBasis;
  monthlyCents: number | null;
  state: ItemState;
  nextDate: string | null;
  firstLateDate: string | null;
  lastMatch: { date: string; amountCents: number } | null;
  recent: { date: string; amountCents: number }[];
  accountName: string | null;
  draft: ItemDraft;
};

export type SuggestionCardView = {
  merchantKey: string;
  merchant: string;
  frequency: Frequency;
  amountCents: number;
  draft: ItemDraft;
};
