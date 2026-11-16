"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { getHistory, type HistoryItem, notATransferAction, removeTransaction, saveNotes, setHiddenAction } from "@/app/(app)/transactions/actions";
import { NOT_A_TRANSFER } from "@/lib/transfer-constants";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDisplayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { TransactionRow } from "@/server/finance/transactions";
import { type CategoryOption, CategorySelect } from "./category-select";
import { linkGoalAction, linkRecurringAction, refreshRow } from "@/app/(app)/transactions/actions";
import { ItemDialog } from "@/components/recurring/item-dialog";
import type { MatchOption } from "@/server/recurring/matching-service";

const SOURCE_LABELS: Record<string, string> = {
  csv: "Imported from a CSV file",
  xlsx: "Imported from an Excel file",
  ofx: "Imported from an OFX file",
  manual: "Added by hand",
  ai: "Added by the assistant",
  sync: "Synced from your bank",
};

/** One line on how this transaction got its category. */
function provenance(row: TransactionRow): string {
  if (row.transferPairId && row.transferPairId !== NOT_A_TRANSFER) return "Paired transfer";
  switch (row.categorizationSource) {
    case "rule":
      return "Sorted by your rule";
    case "history":
      return "Sorted by your past choice";
    case "ai":
      return `Sorted by AI (${Math.round((row.categorizationConfidence ?? 0) * 100)}% sure)`;
    case "user":
      return "You chose this";
    default:
      return "Not sorted yet";
  }
}

/** Full detail for one transaction: notes, category, and its change history. */
export function TransactionSheet({
  row,
  categories,
  accounts,
  matchOptions,
  buckets,
  goals,
  onClose,
  onChange,
  onCategory,
  onUnpaired,
  onRemoved,
}: {
  row: TransactionRow | null;
  categories: CategoryOption[];
  accounts: { id: string; name: string }[];
  matchOptions: MatchOption[];
  buckets: { options: { id: string; name: string }[]; defaultId: string | null };
  goals: { id: string; name: string }[];
  onClose: () => void;
  onChange: (row: TransactionRow) => void;
  onCategory: (row: TransactionRow, categoryId: string | null) => void;
  onUnpaired: (row: TransactionRow) => void;
  onRemoved: (id: string) => void;
}) {
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!row) return;
    let cancelled = false;
    void getHistory(row.id).then((res) => {
      if (!cancelled) setHistory(Array.isArray(res) ? res : []);
    });
    return () => {
      cancelled = true;
      setHistory(null);
    };
  }, [row]);

  return (
    <Sheet open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle className="font-heading text-xl">{row.description}</SheetTitle>
              <SheetDescription>
                {formatDisplayDate(row.date)} · {row.accountName}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-6">
              <p className={cn("num text-3xl font-semibold", row.amountCents > 0 && "text-positive")}>
                {formatCents(row.amountCents, { sign: "always" })}
              </p>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Category</span>
                {row.transferPairId && row.transferPairId !== NOT_A_TRANSFER ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">Transfer</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await notATransferAction(row.id);
                          if ("error" in res) return void toast.error(res.error);
                          onUnpaired(row);
                        })
                      }
                    >
                      Not a transfer
                    </Button>
                  </div>
                ) : (
                  <CategorySelect value={row.categoryId} categories={categories} onChange={(categoryId) => onCategory(row, categoryId)} />
                )}
                <span className="text-xs text-muted-foreground">{provenance(row)}</span>
              </div>
              <RecurringBlock row={row} accounts={accounts} categories={categories} matchOptions={matchOptions} buckets={buckets} onChange={onChange} />
              {goals.length > 0 && <GoalBlock row={row} goals={goals} onChange={onChange} />}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tx-notes">Notes</Label>
                <textarea
                  id="tx-notes"
                  key={row.id}
                  defaultValue={row.notes ?? ""}
                  rows={3}
                  className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  onBlur={(e) => {
                    const notes = e.target.value;
                    if (notes === (row.notes ?? "")) return;
                    startTransition(async () => {
                      const res = await saveNotes(row.id, notes);
                      if ("error" in res) toast.error(res.error);
                      else onChange(res);
                    });
                  }}
                />
              </div>
              <section>
                <h3 className="mb-2 text-sm font-medium">History</h3>
                <ol className="flex flex-col gap-2 border-l pl-4 text-sm">
                  {(history ?? []).map((h) => (
                    <li key={h.id}>
                      {h.label}
                      <span className="block text-xs text-muted-foreground">{new Date(h.at).toLocaleString()}</span>
                    </li>
                  ))}
                  {row.source !== "manual" && <li>{SOURCE_LABELS[row.source] ?? "Imported"}</li>}
                  {history === null && <li className="text-muted-foreground">Loading…</li>}
                </ol>
              </section>
              {row.source !== "manual" && (
                <div className="flex flex-col gap-1.5">
                  <Button
                    variant="outline"
                    className="self-start"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await setHiddenAction(row.id, !row.hidden);
                        if ("error" in res) return void toast.error(res.error);
                        onChange(res);
                        toast.success(res.hidden ? "Hidden. It won't count toward balances." : "Unhidden");
                      })
                    }
                  >
                    {row.hidden ? "Unhide" : "Hide as duplicate"}
                  </Button>
                  {!row.hidden && (
                    <p className="text-xs text-muted-foreground">
                      For a transaction that came in twice. It stays out of balances and won&apos;t come back on re-import.
                    </p>
                  )}
                </div>
              )}
              {row.source === "manual" && (
                <Button
                  variant="outline"
                  className="self-start text-destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await removeTransaction(row.id);
                      if ("error" in res) return void toast.error(res.error);
                      onRemoved(row.id);
                    })
                  }
                >
                  Delete
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Which paycheck or bill this row fulfils, with ways to fix it or start tracking it. */
function RecurringBlock({
  row,
  accounts,
  categories,
  matchOptions,
  buckets,
  onChange,
}: {
  row: TransactionRow;
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
  matchOptions: MatchOption[];
  buckets: { options: { id: string; name: string }[]; defaultId: string | null };
  onChange: (row: TransactionRow) => void;
}) {
  const [tracking, setTracking] = useState(false);
  const [pending, startTransition] = useTransition();
  const incoming = row.amountCents > 0;
  const options = matchOptions.filter((o) => o.direction === (incoming ? "in" : "out"));

  const link = (ref: MatchOption["ref"] | null) =>
    startTransition(async () => {
      const res = await linkRecurringAction(row.id, ref);
      if ("error" in res) toast.error(res.error);
      else onChange(res.row);
    });

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Recurring</span>
      {row.match ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">
            {row.match.name}
            {row.match.expectedDate ? ` · expected ${formatDisplayDate(row.match.expectedDate)}` : ""}
          </span>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => link(null)}>
            Not this one
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {options.length > 0 && (
            <>
              <label htmlFor="tx-part-of" className="sr-only">
                Part of
              </label>
              <select
                id="tx-part-of"
                value=""
                disabled={pending}
                onChange={(e) => {
                  const o = options.find((x) => `${x.ref.kind}:${x.ref.id}` === e.target.value);
                  if (o) link(o.ref);
                }}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Part of…</option>
                {options.map((o) => (
                  <option key={`${o.ref.kind}:${o.ref.id}`} value={`${o.ref.kind}:${o.ref.id}`}>
                    {o.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setTracking(true)}>
            Track as recurring
          </Button>
        </div>
      )}
      <ItemDialog
        open={tracking}
        onOpenChange={setTracking}
        accounts={accounts}
        categories={categories.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName }))}
        initial={{
          kind: incoming ? "income" : "bill",
          name: row.merchant ?? row.description,
          matchPattern: row.merchant ?? row.description,
          anchorDate: row.date,
          amountCents: Math.abs(row.amountCents),
          accountId: row.accountId,
          categoryId: row.categoryId,
        }}
        buckets={buckets}
        onSaved={() =>
          startTransition(async () => {
            const res = await refreshRow(row.id);
            if (!("error" in res)) onChange(res.row);
          })
        }
      />
    </div>
  );
}

/** Count this transaction toward a goal, or say it doesn't count. */
function GoalBlock({ row, goals, onChange }: { row: TransactionRow; goals: { id: string; name: string }[]; onChange: (row: TransactionRow) => void }) {
  const [pending, startTransition] = useTransition();
  const value = row.goal?.counted ? row.goal.id : "";
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="tx-goal">Counts toward</Label>
      <select
        id="tx-goal"
        value={value}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            const res = await linkGoalAction(row.id, e.target.value || null);
            if ("error" in res) toast.error(res.error);
            else onChange(res.row);
          })
        }
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
      >
        <option value="">No goal</option>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {row.goal && !row.goal.counted && <span className="text-xs text-muted-foreground">Doesn&apos;t count toward {row.goal.name}</span>}
    </div>
  );
}
