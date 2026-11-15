"use client";

import { ArrowLeftRight, ListOrdered } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { alwaysCategorizeAction, bulkCategorize, loadMore, setCategory } from "@/app/(app)/transactions/actions";
import { NOT_A_TRANSFER } from "@/lib/transfer-constants";
import { Button } from "@/components/ui/button";
import { formatDisplayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { TransactionFilters, TransactionRow } from "@/server/finance/transactions";
import { CategoryOptions, type CategoryOption, CategorySelect } from "./category-select";
import { QuickAdd } from "./quick-add";
import { TransactionSheet } from "./transaction-sheet";

/** Both sides of a matched transfer carry the same pair id. */
const isTransfer = (r: TransactionRow) => r.transferPairId !== null && r.transferPairId !== NOT_A_TRANSFER;

/** The transactions list with selection, bulk categorize, inline edits, and the detail sheet. */
export function TransactionList({
  initial,
  initialCursor,
  filters,
  filtered,
  accounts,
  categories,
  timezone,
}: {
  initial: TransactionRow[];
  initialCursor: string | null;
  filters: TransactionFilters;
  filtered: boolean;
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
  timezone: string;
}) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [detail, setDetail] = useState<TransactionRow | null>(null);
  const [pending, startTransition] = useTransition();

  const byDate = useMemo(() => {
    const groups: [string, TransactionRow[]][] = [];
    for (const row of items) {
      const last = groups[groups.length - 1];
      if (last && last[0] === row.date) last[1].push(row);
      else groups.push([row.date, [row]]);
    }
    return groups;
  }, [items]);

  const replace = (row: TransactionRow) => {
    if (row.hidden && !filters.includeHidden) {
      setItems((list) => list.filter((r) => r.id !== row.id));
      setDetail(null);
      return;
    }
    setItems((list) => list.map((r) => (r.id === row.id ? row : r)));
    setDetail((d) => (d?.id === row.id ? row : d));
  };

  const router = useRouter();

  /** Re-label rows of one merchant locally after a rule applies to them. */
  const applyLocally = (merchant: string, categoryId: string) => {
    const name = categories.find((c) => c.id === categoryId)?.name ?? null;
    setItems((list) =>
      list.map((r) =>
        r.merchant?.toLowerCase() === merchant.toLowerCase() && r.categorizationSource !== "user" && !isTransfer(r)
          ? { ...r, categoryId, categoryName: name, categorizationSource: "rule", needsReview: false }
          : r,
      ),
    );
  };

  const changeCategory = (row: TransactionRow, categoryId: string | null) => {
    const name = categories.find((c) => c.id === categoryId)?.name ?? null;
    replace({ ...row, categoryId, categoryName: name, categorizationSource: "user", needsReview: false });
    startTransition(async () => {
      const res = await setCategory(row.id, categoryId);
      if ("error" in res) {
        toast.error(res.error);
        replace(row);
        return;
      }
      replace(res.row);
      router.refresh();
      const learned = res.learned;
      if (learned?.kind === "suggest") {
        toast(`Always put ${learned.merchant} in ${learned.categoryName}?`, {
          action: {
            label: "Always",
            onClick: async () => {
              const r = await alwaysCategorizeAction(learned.merchant, learned.categoryId);
              if ("error" in r) return void toast.error(r.error);
              applyLocally(learned.merchant, learned.categoryId);
              router.refresh();
            },
          },
        });
      } else if (learned?.kind === "ruleCreated") {
        applyLocally(learned.merchant, res.row.categoryId!);
        toast.success(`Got it — ${learned.merchant} will always go to ${learned.categoryName}.`);
      }
    });
  };

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allSelected = items.length > 0 && items.every((r) => selected.has(r.id));

  const applyBulk = () => {
    const ids = [...selected];
    const categoryId = bulkCategory || null;
    const name = categories.find((c) => c.id === categoryId)?.name ?? null;
    startTransition(async () => {
      const res = await bulkCategorize(ids, categoryId);
      if ("error" in res) return void toast.error(res.error);
      setItems((list) => list.map((r) => (selected.has(r.id) ? { ...r, categoryId, categoryName: name } : r)));
      setSelected(new Set());
      toast.success(`Updated ${res.changed} ${res.changed === 1 ? "transaction" : "transactions"}`);
    });
  };

  const more = () =>
    startTransition(async () => {
      if (!cursor) return;
      const res = await loadMore({ ...filters, cursor });
      if ("error" in res) return void toast.error(res.error);
      setItems((list) => [...list, ...res.items]);
      setCursor(res.nextCursor);
    });

  const showChecks = selectMode;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <label className={cn("items-center gap-2 text-sm", showChecks ? "flex" : "hidden md:flex")}>
          <input
            type="checkbox"
            aria-label="Select all"
            checked={allSelected}
            onChange={(e) => setSelected(e.target.checked ? new Set(items.map((r) => r.id)) : new Set())}
            className="size-4"
          />
          <span className="text-muted-foreground">Select all</span>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="md:hidden" onClick={() => {
            setSelectMode((m) => !m);
            setSelected(new Set());
          }}>
            {selectMode ? "Done" : "Select"}
          </Button>
          <QuickAdd accounts={accounts} timezone={timezone} onAdded={(row) => setItems((list) => [row, ...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)))} />
        </div>
      </div>

      {selected.size > 0 && (
        <section aria-label="Bulk actions" className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Category
            <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground">
              <option value="">Uncategorized</option>
              <CategoryOptions categories={categories} />
            </select>
          </label>
          <Button size="sm" disabled={pending} onClick={applyBulk}>
            Apply to {selected.size}
          </Button>
        </section>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
          <ListOrdered className="mx-auto size-6 text-muted-foreground" />
          {filtered ? (
            <p className="mt-3 text-sm text-muted-foreground">No transactions match these filters.</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted-foreground">No transactions yet. Import your bank files to get started.</p>
              <Button asChild className="mt-4">
                <Link href="/import">Import files</Link>
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {byDate.map(([date, rows]) => (
            <section key={date}>
              <h2 className="mb-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{formatDisplayDate(date)}</h2>
              <ul className="overflow-hidden rounded-2xl border bg-card shadow-xs">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-start gap-3 border-b px-3 py-3 last:border-b-0 sm:items-center sm:px-4">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.description}`}
                      checked={selected.has(row.id)}
                      onChange={(e) => toggle(row.id, e.target.checked)}
                      className={cn("mt-1 size-4 shrink-0 sm:mt-0", showChecks ? "block" : "hidden md:block")}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-medium", row.hidden && "text-muted-foreground line-through")}>
                          {row.description}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.accountName}
                          {row.notes ? ` · ${row.notes}` : ""}
                        </p>
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        {row.hidden && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Hidden</span>}
                        {row.needsReview && !row.hidden && (
                          <span title="Needs a look" aria-label="Needs a look" className="size-2 shrink-0 rounded-full bg-primary" />
                        )}
                        {isTransfer(row) ? (
                          <button
                            type="button"
                            aria-label="Transfer between your accounts"
                            onClick={() => setDetail(row)}
                            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
                          >
                            <ArrowLeftRight className="size-3" /> Transfer
                          </button>
                        ) : (
                          <CategorySelect value={row.categoryId} categories={categories} onChange={(id) => changeCategory(row, id)} />
                        )}
                      </div>
                    </div>
                    <p className={cn("num shrink-0 text-right text-sm font-medium", row.amountCents > 0 && "text-positive")}>
                      {formatCents(row.amountCents, { sign: "always" })}
                    </p>
                    <Button variant="ghost" size="sm" className="shrink-0 px-2 text-muted-foreground" aria-label="Details" onClick={() => setDetail(row)}>
                      <span className="hidden sm:inline">Details</span>
                      <span className="sm:hidden">⋯</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {cursor && (
            <Button variant="outline" className="self-center" disabled={pending} onClick={more}>
              Load more
            </Button>
          )}
        </div>
      )}

      <TransactionSheet
        row={detail}
        categories={categories}
        onClose={() => setDetail(null)}
        onChange={replace}
        onCategory={changeCategory}
        onUnpaired={(row) => {
          setItems((list) =>
            list.map((r) =>
              r.transferPairId === row.transferPairId
                ? { ...r, transferPairId: NOT_A_TRANSFER, categoryId: null, categoryName: null, categorizationSource: null, needsReview: true }
                : r,
            ),
          );
          setDetail(null);
          router.refresh();
        }}
        onRemoved={(id) => {
          setItems((list) => list.filter((r) => r.id !== id));
          setDetail(null);
          toast.success("Transaction deleted");
        }}
      />
    </div>
  );
}
