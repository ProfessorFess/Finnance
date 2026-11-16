"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { moveGoalAction } from "@/app/(app)/goals/actions";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { ContributionDialog } from "./contribution-dialog";
import { GoalCard } from "./goal-card";
import { GoalDialog } from "./goal-dialog";
import type { BucketOption, GoalCardView, Option } from "./types";

export function GoalsBoard({
  goals,
  archived,
  totalSavedCents,
  today,
  defaultStartDate,
  accounts,
  categories,
  buckets,
}: {
  goals: GoalCardView[];
  archived: GoalCardView[];
  totalSavedCents: number;
  today: string;
  defaultStartDate: string;
  accounts: Option[];
  categories: Option[];
  buckets: BucketOption[];
}) {
  const [editing, setEditing] = useState<{ open: boolean; goal: GoalCardView | null }>({ open: false, goal: null });
  const [adding, setAdding] = useState<GoalCardView | null>(null);
  const [, startTransition] = useTransition();
  const move = (id: string, direction: "up" | "down") =>
    startTransition(async () => {
      const res = await moveGoalAction(id, direction);
      if ("error" in res) toast.error(res.error);
    });

  return (
    <>
      <div className="-mt-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{goals.length > 0 && <>≈ <span className="num font-medium text-foreground">{formatCents(totalSavedCents)}</span> saved across your goals</>}</p>
        <Button onClick={() => setEditing({ open: true, goal: null })}>
          <Plus /> Add goal
        </Button>
      </div>
      {goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Add your first goal — an emergency fund, a trip, paying off a card. Finnance tracks it from the money you move.
        </div>
      ) : (
        <ul aria-label="Goals" className="flex flex-col gap-3">
          {goals.map((g, i) => (
            <GoalCard
              key={g.id}
              goal={g}
              first={i === 0}
              last={i === goals.length - 1}
              onEdit={() => setEditing({ open: true, goal: g })}
              onAddMoney={() => setAdding(g)}
              onMove={(d) => move(g.id, d)}
            />
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <section aria-label="Archived goals" className="mt-8">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Archived ({archived.length})</summary>
            <ul className="mt-3 flex flex-col gap-3">
              {archived.map((g) => (
                <GoalCard key={g.id} goal={g} first last onEdit={() => setEditing({ open: true, goal: g })} onAddMoney={() => setAdding(g)} onMove={() => undefined} />
              ))}
            </ul>
          </details>
        </section>
      )}
      <GoalDialog
        open={editing.open}
        onOpenChange={(o) => setEditing((e) => ({ ...e, open: o }))}
        goal={editing.goal}
        defaultStartDate={defaultStartDate}
        accounts={accounts}
        categories={categories}
        buckets={buckets}
      />
      <ContributionDialog open={adding !== null} onOpenChange={(o) => !o && setAdding(null)} goal={adding} today={today} />
    </>
  );
}
