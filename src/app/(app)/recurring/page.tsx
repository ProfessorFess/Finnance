import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/empty-state";
import type { ItemDraft } from "@/components/recurring/item-dialog";
import { RecurringBoard } from "@/components/recurring/recurring-board";
import type { ItemCardView, SuggestionCardView } from "@/components/recurring/types";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAccounts } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import type { IncomeSource, RecurringRule } from "@/server/recurring/items-service";
import { getRecurringOverview, type RecurringItemView } from "@/server/recurring/overview";
import { listSuggestions, type SuggestionView } from "@/server/recurring/suggestions-service";

export const metadata = { title: "Recurring · Finnance" };

function draftOf(v: RecurringItemView): ItemDraft {
  const base = {
    id: v.item.id,
    name: v.item.name,
    frequency: v.item.frequency,
    anchorDate: v.item.anchorDate ?? undefined,
    secondDay: v.item.secondDay,
    amountCents: v.item.expectedCents,
    accountId: v.item.accountId,
    categoryId: v.item.categoryId,
    matchPattern: v.item.matchPattern,
  };
  if (v.kind === "income") {
    const s = v.item as IncomeSource;
    return { ...base, kind: "income", amountMode: s.amountMode, incomeType: s.type };
  }
  const r = v.item as RecurringRule;
  return { ...base, kind: r.kind, amountVaries: r.amountVaries };
}

function cardOf(v: RecurringItemView): ItemCardView {
  return {
    key: `${v.ref.kind}:${v.ref.id}`,
    name: v.name,
    kind: v.kind,
    frequency: v.frequency,
    amountCents: v.amountCents,
    amountBasis: v.amountBasis,
    monthlyCents: v.monthlyCents,
    state: v.state,
    nextDate: v.nextDate,
    firstLateDate: v.lateDates[0] ?? null,
    lastMatch: v.lastMatch,
    recent: v.recentMatches.map((m) => ({ date: m.date, amountCents: m.amountCents })),
    accountName: v.accountName,
    draft: draftOf(v),
  };
}

function suggestionOf(s: SuggestionView): SuggestionCardView {
  const income = s.kindGuess === "income";
  return {
    merchantKey: s.merchantKey,
    merchant: s.merchant,
    frequency: s.frequency,
    amountCents: s.amountCents,
    draft: {
      kind: s.kindGuess,
      name: s.merchant,
      matchPattern: s.merchant,
      frequency: s.frequency,
      anchorDate: s.lastDate,
      amountCents: s.amountCents,
      ...(income ? { amountMode: s.amountVaries ? "varies" : "fixed" } : { amountVaries: s.amountVaries }),
      accountId: s.accountId,
      categoryId: s.categoryId,
    },
  };
}

export default async function RecurringPage() {
  const user = await requireUser();
  const db = getDb();
  const [overview, suggestions, accounts, categories] = await Promise.all([
    getRecurringOverview(db, user.id),
    listSuggestions(db, user.id),
    listAccounts(db, user.id),
    listCategories(db, user.id),
  ]);

  return (
    <div className="rise">
      <PageHeader title="Recurring" description="Paychecks, bills, and subscriptions, entered once." />
      {!overview.hasStartDate ? (
        <EmptyState
          icon={CalendarClock}
          title="Set your tracking start date first"
          description="Finnance expects paychecks and bills from your start date onward. Set it on the Accounts page, then come back to add them."
          action={
            <Button asChild variant="outline">
              <Link href="/accounts">Go to Accounts</Link>
            </Button>
          }
        />
      ) : (
        <RecurringBoard
          income={overview.income.map(cardOf)}
          bills={overview.bills.map(cardOf)}
          suggestions={suggestions.map(suggestionOf)}
          monthlyIncomeCents={overview.monthlyIncomeCents}
          monthlyBillsCents={overview.monthlyBillsCents}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName }))}
        />
      )}
    </div>
  );
}
