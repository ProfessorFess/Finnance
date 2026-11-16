"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type DialogCategory, type DialogOption, type ItemDraft, ItemDialog } from "./item-dialog";
import { ItemCard } from "./item-card";
import { RecurringSummary } from "./recurring-summary";
import { SuggestionList } from "./suggestion-list";
import type { ItemCardView, SuggestionCardView } from "./types";

function Section({ title, items, empty, onOpen }: { title: string; items: ItemCardView[]; empty: string; onOpen: (i: ItemCardView) => void }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          {items.map((i) => (
            <ItemCard key={i.key} item={i} onOpen={() => onOpen(i)} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function RecurringBoard({
  income,
  bills,
  suggestions,
  monthlyIncomeCents,
  monthlyBillsCents,
  accounts,
  categories,
}: {
  income: ItemCardView[];
  bills: ItemCardView[];
  suggestions: SuggestionCardView[];
  monthlyIncomeCents: number;
  monthlyBillsCents: number;
  accounts: DialogOption[];
  categories: DialogCategory[];
}) {
  const [dialog, setDialog] = useState<{ open: boolean; draft: ItemDraft; recent: ItemCardView["recent"] }>({ open: false, draft: {}, recent: [] });
  const open = (draft: ItemDraft, recent: ItemCardView["recent"] = []) => setDialog({ open: true, draft, recent });

  return (
    <>
      <div className="-mt-4 mb-6 flex justify-end">
        <Button onClick={() => open({})}>
          <Plus /> Add
        </Button>
      </div>
      <SuggestionList suggestions={suggestions} onTrack={(s) => open(s.draft)} />
      {(income.length > 0 || bills.length > 0) && <RecurringSummary monthlyIncomeCents={monthlyIncomeCents} monthlyBillsCents={monthlyBillsCents} />}
      <Section
        title="Income"
        items={income}
        empty="Add your paycheck — Finnance will expect it and match it when it arrives."
        onOpen={(i) => open(i.draft, i.recent)}
      />
      <Section
        title="Bills & subscriptions"
        items={bills}
        empty="Add bills and subscriptions, or track one from Transactions."
        onOpen={(i) => open(i.draft, i.recent)}
      />
      <ItemDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        accounts={accounts}
        categories={categories}
        initial={dialog.draft}
        recent={dialog.recent}
      />
    </>
  );
}
