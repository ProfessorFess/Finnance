"use client";

import { ArrowDownLeft, CalendarClock, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDisplayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { FREQUENCY_LABELS, KIND_LABELS } from "@/lib/recurring-labels";
import { cn } from "@/lib/utils";
import type { ItemCardView } from "./types";

function StateChip({ item }: { item: ItemCardView }) {
  switch (item.state) {
    case "late":
      return <Badge variant="destructive">Late · expected {formatDisplayDate(item.firstLateDate!)}</Badge>;
    case "awaiting":
      return <Badge variant="outline">Waiting for import</Badge>;
    case "due_soon":
      return <Badge variant="secondary">{item.kind === "income" ? "Expected" : "Due"} {formatDisplayDate(item.nextDate!)}</Badge>;
    case "paused":
      return <Badge variant="outline">Paused</Badge>;
    default:
      return null;
  }
}

export function ItemCard({ item, onOpen }: { item: ItemCardView; onOpen: () => void }) {
  const income = item.kind === "income";
  const Icon = income ? ArrowDownLeft : item.kind === "transfer" ? Repeat : CalendarClock;
  const approx = item.amountBasis === "estimate" || item.amountBasis === "history";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 border-b px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-5"
      >
        <div className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", income ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-medium">{item.name}</p>
            <StateChip item={item} />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[income ? null : KIND_LABELS[item.kind], FREQUENCY_LABELS[item.frequency], item.accountName].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">
              {item.frequency === "irregular" ? "Irregular" : item.nextDate ? `Next ${formatDisplayDate(item.nextDate)}` : "No upcoming date"}
            </span>
            {item.lastMatch ? (
              <span className="whitespace-nowrap">
                Last {formatDisplayDate(item.lastMatch.date)} · <span className="num">{formatCents(item.lastMatch.amountCents)}</span>
              </span>
            ) : (
              <span className="whitespace-nowrap">Not seen yet</span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {item.amountCents === null ? (
            <p className="max-w-28 text-xs text-muted-foreground">Amount set by your first deposit</p>
          ) : (
            <p className={cn("num font-medium", income && "text-primary")}>
              {approx && "≈ "}
              {formatCents(item.amountCents)}
            </p>
          )}
          {item.monthlyCents !== null && item.frequency !== "monthly" && item.frequency !== "irregular" && (
            <p className="num text-xs text-muted-foreground">≈ {formatCents(item.monthlyCents)}/mo</p>
          )}
        </div>
      </button>
    </li>
  );
}
