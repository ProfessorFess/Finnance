import type { AmountMode, IncomeType, RecurringKind } from "@/server/db/finance-schema";
import type { Frequency } from "@/server/recurring/schedule";

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  yearly: "Yearly",
  irregular: "Irregular",
};

export const KIND_LABELS: Record<"income" | RecurringKind, string> = {
  income: "Income",
  bill: "Bill",
  subscription: "Subscription",
  transfer: "Transfer",
};

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  salary: "Salary",
  hourly: "Hourly",
  freelance: "Freelance",
  benefits: "Benefits",
  side_income: "Side income",
  other: "Other",
};

export const AMOUNT_MODE_LABELS: Record<AmountMode, string> = {
  fixed: "Same every time",
  varies: "Varies",
  estimated: "Estimate from deposits",
};
