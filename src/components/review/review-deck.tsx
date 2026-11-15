"use client";

import { CheckCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { alwaysCategorizeAction } from "@/app/(app)/transactions/actions";
import { confirmCategory, sortNow } from "@/app/(app)/transactions/review/actions";
import { type CategoryOption, CategorySelect } from "@/components/transactions/category-select";
import { Button } from "@/components/ui/button";
import { formatDisplayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { TransactionRow } from "@/server/finance/transactions";

const SWIPE_PX = 90;

/**
 * One card at a time. Pick a category, accept Finnance's guess (swipe right),
 * or skip (swipe left). Skipped cards come back at the end, once per session.
 */
export function ReviewDeck({
  rows,
  categories,
  popular,
  unsorted,
}: {
  rows: TransactionRow[];
  categories: CategoryOption[];
  popular: string[];
  unsorted: number;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState(rows);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [pending, startTransition] = useTransition();
  const startX = useRef<number | null>(null);
  const total = rows.length;
  const current = queue.find((r) => !skipped.has(r.id)) ?? null;
  const position = done + skipped.size + 1;

  const quickPicks = useMemo(() => {
    const ids = [current?.categoryId, ...popular].filter((id): id is string => Boolean(id));
    return [...new Set(ids)].slice(0, 6).map((id) => categories.find((c) => c.id === id)).filter(Boolean) as CategoryOption[];
  }, [current, popular, categories]);

  const advance = (removeMerchant?: string) => {
    if (!current) return;
    setQueue((q) =>
      q.filter((r) => r.id !== current.id && !(removeMerchant && r.merchant?.toLowerCase() === removeMerchant.toLowerCase())),
    );
    setDone((d) => d + 1);
    setDragX(0);
  };

  const choose = (categoryId: string) => {
    if (!current) return;
    const row = current;
    advance();
    startTransition(async () => {
      const res = await confirmCategory(row.id, categoryId);
      if ("error" in res) return void toast.error(res.error);
      const learned = res.learned;
      if (learned?.kind === "ruleCreated") {
        setQueue((q) => q.filter((r) => r.merchant?.toLowerCase() !== learned.merchant.toLowerCase()));
        toast.success(`Got it — ${learned.merchant} will always go to ${learned.categoryName}.`);
      } else if (learned?.kind === "suggest") {
        toast(`Always put ${learned.merchant} in ${learned.categoryName}?`, {
          action: {
            label: "Always",
            onClick: async () => {
              const r = await alwaysCategorizeAction(learned.merchant, learned.categoryId);
              if ("error" in r) return void toast.error(r.error);
              setQueue((q) => q.filter((x) => x.merchant?.toLowerCase() !== learned.merchant.toLowerCase()));
            },
          },
        });
      }
    });
  };

  const skip = () => {
    if (!current) return;
    setSkipped((s) => new Set(s).add(current.id));
    setDragX(0);
  };

  const sort = () =>
    startTransition(async () => {
      const res = await sortNow();
      if ("error" in res) return void toast.error(res.error);
      const sorted = res.byRule + res.byHistory + res.byAi + res.transfers * 2;
      toast.success(`Sorted ${sorted}. ${res.needsReview} need a look.`);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      {unsorted > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-xs sm:flex-row sm:items-center">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold">Sort your transactions</h2>
            <p className="text-sm text-muted-foreground">
              {unsorted} {unsorted === 1 ? "transaction hasn't" : "transactions haven't"} been sorted yet. Finnance can match
              transfers and fill in categories for you.
            </p>
          </div>
          <Button onClick={sort} disabled={pending}>
            {pending ? "Sorting…" : "Sort now"}
          </Button>
        </section>
      )}

      {current ? (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {Math.min(position, total)} of {total}
          </p>
          <article
            aria-label="Transaction to review"
            className="relative touch-pan-y rounded-2xl border bg-card p-6 shadow-sm transition-transform select-none"
            style={{ transform: `translateX(${dragX}px) rotate(${dragX / 40}deg)` }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              startX.current = e.clientX;
            }}
            onPointerMove={(e) => {
              if (startX.current !== null) setDragX(e.clientX - startX.current);
            }}
            onPointerUp={() => {
              if (startX.current === null) return;
              startX.current = null;
              if (dragX > SWIPE_PX && current.categoryId) choose(current.categoryId);
              else if (dragX < -SWIPE_PX) skip();
              else setDragX(0);
            }}
            onPointerCancel={() => {
              startX.current = null;
              setDragX(0);
            }}
          >
            <p className="font-heading text-2xl font-semibold">{current.merchant ?? current.description}</p>
            {current.merchant && current.merchant !== current.description && (
              <p className="mt-1 truncate text-xs text-muted-foreground">{current.description}</p>
            )}
            <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className={cn("num text-3xl font-semibold", current.amountCents > 0 && "text-positive")}>
                {formatCents(current.amountCents, { sign: "always" })}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatDisplayDate(current.date)} · {current.accountName}
              </span>
            </div>
            {current.categoryId && current.categoryName && (
              <div className="mt-5">
                <Button size="lg" className="w-full sm:w-auto" disabled={pending} onClick={() => choose(current.categoryId!)}>
                  <CheckCheck /> {current.categoryName}
                  {current.categorizationConfidence !== null && (
                    <span className="ml-1 text-xs opacity-80">{Math.round(current.categorizationConfidence * 100)}% sure</span>
                  )}
                </Button>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {quickPicks
                .filter((c) => c.id !== current.categoryId)
                .map((c) => (
                  <Button key={c.id} variant="outline" size="sm" disabled={pending} onClick={() => choose(c.id)}>
                    {c.name}
                  </Button>
                ))}
            </div>
            <div className="mt-5 flex items-center justify-between gap-2 border-t pt-4">
              <div className="flex items-center gap-2 text-sm">
                <CategorySelect
                  value={null}
                  categories={categories}
                  onChange={(id) => id && choose(id)}
                  label="More categories"
                />
              </div>
              <Button variant="ghost" onClick={skip}>
                Skip
              </Button>
            </div>
          </article>
          <p className="text-center text-xs text-muted-foreground">Swipe right to accept the suggestion, left to skip.</p>
        </>
      ) : (
        <section className="rounded-2xl border bg-card px-6 py-12 text-center shadow-xs">
          <CheckCheck className="mx-auto size-8 text-positive" />
          <h2 className="mt-3 text-xl font-semibold">All caught up</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nothing left to review right now.</p>
          <Button asChild variant="outline" className="mt-5">
            <Link href="/transactions">Back to transactions</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
