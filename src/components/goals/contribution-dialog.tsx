"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addContributionAction, setContributionCountedAction } from "@/app/(app)/goals/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDisplayDate } from "@/lib/dates";
import { formatCents, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { GoalCardView } from "./types";

const SOURCE_LABELS = { manual: "by hand", auto: "automatically", linked: "linked" } as const;

/** Add money to a goal by hand, and see (or fix) what counted toward it. */
export function ContributionDialog({ open, onOpenChange, goal, today }: { open: boolean; onOpenChange: (open: boolean) => void; goal: GoalCardView | null; today: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!goal) return null;

  const toggle = (id: string, counted: boolean) =>
    startTransition(async () => {
      const res = await setContributionCountedAction(id, counted);
      if ("error" in res) toast.error(res.error);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form
          className="flex flex-col gap-4"
          action={(f) =>
            startTransition(async () => {
              const cents = parseAmountToCents(String(f.get("amount") ?? ""));
              if (cents === null || cents === 0) return setError("Enter an amount");
              const res = await addContributionAction(goal.id, { date: String(f.get("date") ?? today), amountCents: cents, note: String(f.get("note") ?? "").trim() || undefined });
              if ("error" in res) return setError(res.error);
              toast.success(`Added to ${goal.name}`);
              onOpenChange(false);
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Add money to {goal.name}</DialogTitle>
            <DialogDescription>Use a minus sign for money taken out.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contribution-amount">Amount</Label>
              <Input id="contribution-amount" name="amount" inputMode="decimal" required placeholder="0.00" className="num" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contribution-date">Date</Label>
              <Input id="contribution-date" name="date" type="date" required defaultValue={today} />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="contribution-note">Note</Label>
              <Input id="contribution-note" name="note" maxLength={200} placeholder="Optional" />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
        {goal.recent.length > 0 && (
          <section className="border-t pt-4">
            <h3 className="mb-2 text-sm font-medium">Recent</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {goal.recent.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className={cn("flex-1", !c.counted && "text-muted-foreground line-through")}>
                    {formatDisplayDate(c.date)} · {SOURCE_LABELS[c.source]}
                    {c.note ? ` · ${c.note}` : ""}
                  </span>
                  <span className="num">{formatCents(c.amountCents)}</span>
                  <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => toggle(c.id, c.source === "manual" ? false : !c.counted)}>
                    {c.source === "manual" ? "Remove" : c.counted ? "Doesn't count" : "Count it"}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
