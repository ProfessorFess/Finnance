"use client";

import { Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { dismissSuggestionAction } from "@/app/(app)/recurring/actions";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { FREQUENCY_LABELS } from "@/lib/recurring-labels";
import type { SuggestionCardView } from "./types";

export function SuggestionList({ suggestions, onTrack }: { suggestions: SuggestionCardView[]; onTrack: (s: SuggestionCardView) => void }) {
  const [pending, startTransition] = useTransition();
  if (suggestions.length === 0) return null;
  return (
    <section className="mb-8" aria-label="Suggestions">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Sparkles className="size-4 text-primary" /> Finnance noticed
      </h2>
      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <li key={s.merchantKey} className="flex flex-col gap-3 rounded-2xl border bg-card px-4 py-3 shadow-xs sm:flex-row sm:items-center sm:px-5">
            <p className="flex-1 text-sm">
              Looks like <span className="font-medium">{s.merchant}</span>, <span className="num">{formatCents(s.amountCents)}</span>{" "}
              {FREQUENCY_LABELS[s.frequency].toLowerCase()}. Track it?
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onTrack(s)}>
                Track
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await dismissSuggestionAction(s.merchantKey);
                    if ("error" in res) toast.error(res.error);
                  })
                }
              >
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
