"use client";

import { ArrowRight, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { removeRule } from "@/app/(app)/settings/rules/actions";
import { Button } from "@/components/ui/button";

export type RuleView = {
  id: string;
  matchType: "merchant_equals" | "description_contains" | "regex";
  pattern: string;
  categoryName: string;
  createdFrom: "user" | "correction" | "default";
};

const MATCH_LABEL: Record<RuleView["matchType"], string> = {
  merchant_equals: "merchant is",
  description_contains: "description contains",
  regex: "description matches",
};

export function RuleList({ title, rules, empty }: { title: string; rules: RuleView[]; empty: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {rules.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-5 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0 sm:px-5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground">When {MATCH_LABEL[r.matchType]}</span>
                <span className="truncate font-medium">&quot;{r.pattern}&quot;</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">{r.categoryName}</span>
                {r.createdFrom === "correction" && <span className="text-xs text-muted-foreground">Learned</span>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete rule ${r.pattern}`}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await removeRule(r.id);
                    if ("error" in res) toast.error(res.error);
                  })
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
