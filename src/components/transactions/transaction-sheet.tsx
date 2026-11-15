"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { getHistory, type HistoryItem, removeTransaction, saveNotes } from "@/app/(app)/transactions/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDisplayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { TransactionRow } from "@/server/finance/transactions";
import { type CategoryOption, CategorySelect } from "./category-select";

const SOURCE_LABELS: Record<string, string> = {
  csv: "Imported from a CSV file",
  xlsx: "Imported from an Excel file",
  ofx: "Imported from an OFX file",
  manual: "Added by hand",
  ai: "Added by the assistant",
  sync: "Synced from your bank",
};

/** Full detail for one transaction: notes, category, and its change history. */
export function TransactionSheet({
  row,
  categories,
  onClose,
  onChange,
  onCategory,
  onRemoved,
}: {
  row: TransactionRow | null;
  categories: CategoryOption[];
  onClose: () => void;
  onChange: (row: TransactionRow) => void;
  onCategory: (row: TransactionRow, categoryId: string | null) => void;
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
                <CategorySelect
                  value={row.categoryId}
                  categories={categories}
                  onChange={(categoryId) => onCategory(row, categoryId)}
                />
              </div>
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
