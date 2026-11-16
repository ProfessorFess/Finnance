"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deletePlanAction, renamePlanAction, setExtraIncomeAction, setPlanIncomesAction } from "@/app/(app)/plan/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlanCadence } from "@/server/db/finance-schema";

const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm";

export type SettingsIncome = { id: string; name: string; scheduled: boolean };

/** Plan-wide settings in edit mode: name, incomes, the extra-income rule, and starting over. */
export function PlanSettings({
  plan,
  incomes,
  planIncomeIds,
  buckets,
  extraRule,
}: {
  plan: { id: string; name: string; cadence: PlanCadence };
  incomes: SettingsIncome[];
  planIncomeIds: string[];
  buckets: { id: string; name: string }[];
  extraRule: { bucketId: string; incomeSourceId: string | null } | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(planIncomeIds));
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { error: string }>, success: string) =>
    startTransition(async () => {
      const res = await fn();
      if ("error" in res) toast.error(res.error);
      else toast.success(success);
    });
  const scheduledInPlan = incomes.filter((i) => i.scheduled && planIncomeIds.includes(i.id));
  const ruleSource = extraRule?.incomeSourceId ?? scheduledInPlan[0]?.id ?? null;

  return (
    <section aria-label="Plan settings" className="flex flex-col gap-5 rounded-2xl border border-dashed p-5">
      <form className="flex items-end gap-2" action={(f) => run(() => renamePlanAction(plan.id, String(f.get("name") ?? "")), "Renamed")}>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="plan-name">Plan name</Label>
          <Input id="plan-name" name="name" defaultValue={plan.name} maxLength={80} />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          Rename
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Funded by</span>
        {incomes.map((i) => (
          <label key={i.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(i.id)}
              onChange={(e) =>
                setSelected((set) => {
                  const next = new Set(set);
                  if (e.target.checked) next.add(i.id);
                  else next.delete(i.id);
                  return next;
                })
              }
              className="size-4 accent-primary"
            />
            {i.name}
          </label>
        ))}
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={pending} onClick={() => run(() => setPlanIncomesAction(plan.id, [...selected]), "Incomes saved")}>
          Save incomes
        </Button>
      </div>

      {plan.cadence === "per_income" && ruleSource && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="extra-rule">Extra paychecks from {incomes.find((i) => i.id === ruleSource)?.name} go to</Label>
          <select
            id="extra-rule"
            defaultValue={extraRule?.bucketId ?? ""}
            disabled={pending}
            onChange={(e) =>
              run(
                () => setExtraIncomeAction(plan.id, e.target.value ? { bucketId: e.target.value, incomeSourceId: ruleSource, percentBps: 10_000 } : null),
                "Saved",
              )
            }
            className={selectClass}
          >
            <option value="">Nowhere special</option>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <Button type="button" variant="ghost" className="self-start text-destructive" onClick={() => setConfirm(true)}>
        Start over
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your plan?</AlertDialogTitle>
            <AlertDialogDescription>Your transactions and recurring items stay.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => run(() => deletePlanAction(plan.id), "Plan deleted")}>
              Delete plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
