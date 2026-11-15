"use client";

import { ChevronDown } from "lucide-react";
import { Fragment } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type CategoryOption = { id: string; name: string; groupName: string };

/** Groups categories in their display order. */
export function groupCategories(categories: CategoryOption[]): [string, CategoryOption[]][] {
  const groups = new Map<string, CategoryOption[]>();
  for (const c of categories) groups.set(c.groupName, [...(groups.get(c.groupName) ?? []), c]);
  return [...groups.entries()];
}

/** Inline category picker: a chip showing the current category, opening a grouped menu. */
export function CategorySelect({
  value,
  categories,
  onChange,
  disabled,
  label: fixedLabel,
}: {
  value: string | null;
  categories: CategoryOption[];
  onChange: (categoryId: string | null) => void;
  disabled?: boolean;
  /** Show this instead of the current category (e.g. "More categories"). */
  label?: string;
}) {
  const current = categories.find((c) => c.id === value);
  const label = fixedLabel ?? current?.name ?? "Uncategorized";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={fixedLabel ?? `Category: ${label}`}
        className={cn(
          "inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-accent",
          current ? "border-transparent bg-secondary text-secondary-foreground" : "border-dashed text-muted-foreground",
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange(null)}>Uncategorized</DropdownMenuItem>
        {groupCategories(categories).map(([group, items]) => (
          <Fragment key={group}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{group}</DropdownMenuLabel>
            {items.map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => onChange(c.id)}>
                {c.name}
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Native grouped <select> of categories (for filters and bulk actions). */
export function CategoryOptions({ categories, includeUncategorized }: { categories: CategoryOption[]; includeUncategorized?: boolean }) {
  return (
    <>
      {includeUncategorized && <option value="uncategorized">Uncategorized</option>}
      {groupCategories(categories).map(([group, items]) => (
        <optgroup key={group} label={group}>
          {items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
