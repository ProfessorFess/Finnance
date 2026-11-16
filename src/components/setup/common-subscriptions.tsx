"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addCommonSubscriptionsAction } from "@/app/(app)/setup/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, parseAmountToCents } from "@/lib/money";
import { COMMON_SUBSCRIPTIONS } from "@/server/home/common-subscriptions";

const toInput = (cents: number) => (cents / 100).toFixed(2);

/** A checklist of common subscriptions with editable prices. */
export function CommonSubscriptions({ today, exclude, onAdded }: { today: string; exclude: Set<string>; onAdded: () => void }) {
  const options = COMMON_SUBSCRIPTIONS.filter((s) => !exclude.has(s.name.toLowerCase()));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(COMMON_SUBSCRIPTIONS.map((s) => [s.name, toInput(s.cents)])));
  const [pending, startTransition] = useTransition();
  if (options.length === 0) return null;

  const add = () =>
    startTransition(async () => {
      const items = options
        .filter((s) => picked.has(s.name))
        .map((s) => ({ name: s.name, matchPattern: s.matchPattern, anchorDate: today, cents: parseAmountToCents(amounts[s.name] ?? "") ?? 0 }));
      const res = await addCommonSubscriptionsAction(items);
      if ("error" in res) return void toast.error(res.error);
      toast.success(`Added ${res.added} ${res.added === 1 ? "subscription" : "subscriptions"}`);
      setPicked(new Set());
      onAdded();
    });

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">Common subscriptions</legend>
      <ul className="grid gap-2 sm:grid-cols-2">
        {options.map((s) => {
          const id = `sub-${s.name.replace(/\W+/g, "-").toLowerCase()}`;
          return (
            <li key={s.name} className="flex items-center gap-3 rounded-xl border px-3 py-2">
              <input
                id={id}
                type="checkbox"
                className="size-4 accent-primary"
                checked={picked.has(s.name)}
                onChange={(e) =>
                  setPicked((p) => {
                    const next = new Set(p);
                    if (e.target.checked) next.add(s.name);
                    else next.delete(s.name);
                    return next;
                  })
                }
              />
              <label htmlFor={id} className="flex-1 text-sm">
                {s.name}
              </label>
              <Input
                aria-label={`${s.name} price`}
                inputMode="decimal"
                className="num h-8 w-24 text-right"
                value={amounts[s.name] ?? ""}
                placeholder={formatCents(s.cents)}
                onChange={(e) => setAmounts((a) => ({ ...a, [s.name]: e.target.value }))}
              />
            </li>
          );
        })}
      </ul>
      <Button type="button" className="self-start" disabled={pending || picked.size === 0} onClick={add}>
        Add selected
      </Button>
    </fieldset>
  );
}
