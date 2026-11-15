"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoryOptions, type CategoryOption } from "./category-select";

export type UrlFilters = { q?: string; account?: string; category?: string; from?: string; to?: string; hidden?: string };

const selectClass = "h-8 rounded-lg border border-input bg-background px-2 text-sm";

/** Search and filters, kept in the URL so they survive reloads and can be shared. */
export function FiltersBar({
  filters,
  accounts,
  categories,
}: {
  filters: UrlFilters;
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filters.q ?? "");
  const [showHidden, setShowHidden] = useState(filters.hidden === "1");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = (next: UrlFilters) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const set = (patch: UrlFilters) => push({ ...filters, q, ...patch });

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const active = Boolean(filters.q || filters.account || filters.category || filters.from || filters.to);

  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search transactions"
          placeholder="Search transactions"
          value={q}
          className="h-10 pl-9"
          onChange={(e) => {
            const value = e.target.value;
            setQ(value);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => push({ ...filters, q: value }), 300);
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Account filter" className={selectClass} value={filters.account ?? ""}
          onChange={(e) => set({ account: e.target.value })}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select aria-label="Category filter" className={selectClass} value={filters.category ?? ""}
          onChange={(e) => set({ category: e.target.value })}>
          <option value="">All categories</option>
          <CategoryOptions categories={categories} includeUncategorized />
        </select>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          From
          <input type="date" aria-label="From date" className={selectClass} value={filters.from ?? ""}
            onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          To
          <input type="date" aria-label="To date" className={selectClass} value={filters.to ?? ""}
            onChange={(e) => set({ to: e.target.value })} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => {
              setShowHidden(e.target.checked);
              set({ hidden: e.target.checked ? "1" : undefined });
            }}
          />
          Show hidden
        </label>
        {active && (
          <Button variant="ghost" size="sm" onClick={() => {
            setQ("");
            push({});
          }}>
            <X /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}
