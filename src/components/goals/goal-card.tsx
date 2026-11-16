"use client";

import { ChevronDown, ChevronUp, Landmark, type LucideIcon, PiggyBank, ShoppingBag, Sunset, Target } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { setGoalStatusAction } from "@/app/(app)/goals/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDisplayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { GoalChip } from "@/server/goals/projection";
import type { GoalCardView } from "./types";

const ICONS: Record<string, LucideIcon> = { "piggy-bank": PiggyBank, landmark: Landmark, "shopping-bag": ShoppingBag, sunset: Sunset };
const TYPE_LABELS = { savings: "Savings", debt_payoff: "Debt payoff", purchase: "Purchase", retirement: "Retirement" } as const;
const CHIP: Record<GoalChip, { text: string; variant: "secondary" | "outline" | "destructive" | "default" }> = {
  done: { text: "Done", variant: "default" },
  ahead: { text: "Ahead", variant: "secondary" },
  on_track: { text: "On track", variant: "secondary" },
  behind: { text: "Behind", variant: "destructive" },
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export function GoalCard({
  goal,
  first,
  last,
  onEdit,
  onAddMoney,
  onMove,
}: {
  goal: GoalCardView;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onAddMoney: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const [pending, startTransition] = useTransition();
  const p = goal.projection;
  const Icon = ICONS[goal.icon] ?? Target;
  const chip = p.chip ? CHIP[p.chip] : null;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium leading-snug break-words">{goal.name}</h3>
          <p className="text-xs text-muted-foreground">
            {TYPE_LABELS[goal.type]}
            {goal.status === "paused" ? " · Paused" : goal.status === "completed" ? " · Completed" : ""}
          </p>
        </div>
        {chip && <Badge variant={chip.variant}>{chip.text}</Badge>}
        <div className="flex">
          <Button type="button" variant="ghost" size="icon" aria-label={`Move ${goal.name} up`} disabled={first} onClick={() => onMove("up")}>
            <ChevronUp />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Move ${goal.name} down`} disabled={last} onClick={() => onMove("down")}>
            <ChevronDown />
          </Button>
        </div>
      </div>

      {goal.targetCents !== null ? (
        <p className="num text-2xl font-semibold">
          {formatCents(p.progressCents)} <span className="text-base font-normal text-muted-foreground">of {formatCents(goal.targetCents)}</span>
        </p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="num text-2xl font-semibold">
            {formatCents(p.progressCents)} <span className="text-base font-normal text-muted-foreground">saved</span>
          </p>
          <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={onEdit}>
            Set a target
          </Button>
        </div>
      )}

      {p.percent !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className={cn("h-full rounded-full", p.chip === "behind" ? "bg-destructive" : "bg-primary")} style={{ width: `${p.percent * 100}%` }} />
        </div>
      )}

      <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
        {goal.targetCents !== null && !p.reached && (
          <p>
            {p.paceMonthlyCents === null
              ? "Add a planned amount to see when you'll get there"
              : p.paceBasis === "plan"
                ? `At ≈ ${formatCents(p.paceMonthlyCents)}/mo (your plan)${p.projectedDate ? `, done by ${monthYear(p.projectedDate)}` : ""}`
                : `At your recent pace of ≈ ${formatCents(p.paceMonthlyCents)}/mo${p.projectedDate ? `, done by ${monthYear(p.projectedDate)}` : ""}`}
          </p>
        )}
        {p.neededMonthlyCents !== null && goal.targetDate && (
          <p>
            Needs ≈ {formatCents(p.neededMonthlyCents)}/mo to finish by {formatDisplayDate(goal.targetDate)}
          </p>
        )}
        {goal.trackLabel && <p className="text-xs">Counts {goal.trackLabel.charAt(0).toLowerCase() + goal.trackLabel.slice(1)}</p>}
      </div>

      {goal.askDone && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-sm">
          <span className="flex-1">
            {goal.rollOverTo ? `Reached! Mark it done so what comes next goes to ${goal.rollOverTo}.` : "Reached! Mark it done."}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await setGoalStatusAction(goal.id, "completed");
                if ("error" in res) toast.error(res.error);
                else toast.success(`${goal.name} is done`);
              })
            }
          >
            Mark done
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onAddMoney}>
          Add money
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </li>
  );
}
