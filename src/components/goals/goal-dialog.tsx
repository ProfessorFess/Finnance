"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteGoalAction, saveGoalAction, setGoalStatusAction } from "@/app/(app)/goals/actions";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseAmountToCents } from "@/lib/money";
import type { GoalStatus, GoalType, PlannedPer } from "@/server/db/finance-schema";
import type { BucketOption, GoalCardView, Option } from "./types";

const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm";
const toInput = (c: number | null) => (c ? (c / 100).toFixed(2) : "");
const TYPES: Record<GoalType, string> = { savings: "Savings", debt_payoff: "Debt payoff", purchase: "Purchase", retirement: "Retirement" };

/** Add or edit a goal. Everything but the name is optional. */
export function GoalDialog({
  open,
  onOpenChange,
  goal,
  defaultStartDate,
  accounts,
  categories,
  buckets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: GoalCardView | null;
  defaultStartDate: string;
  accounts: Option[];
  categories: Option[];
  buckets: BucketOption[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {open && <GoalForm goal={goal} defaultStartDate={defaultStartDate} accounts={accounts} categories={categories} buckets={buckets} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function GoalForm({
  goal,
  defaultStartDate,
  accounts,
  categories,
  buckets,
  onDone,
}: {
  goal: GoalCardView | null;
  defaultStartDate: string;
  accounts: Option[];
  categories: Option[];
  buckets: BucketOption[];
  onDone: () => void;
}) {
  const initialCounts = goal?.trackAccountId ? `account:${goal.trackAccountId}` : goal?.trackCategoryId ? `category:${goal.trackCategoryId}` : "";
  const [counts, setCounts] = useState(initialCounts);
  const [bucketId, setBucketId] = useState(goal?.fundedByBucketId ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (f: FormData) =>
    startTransition(async () => {
      const cents = (name: string) => {
        const raw = String(f.get(name) ?? "").trim();
        if (!raw) return null;
        const v = parseAmountToCents(raw);
        return v === null ? Number.NaN : v;
      };
      const target = cents("target");
      const starting = cents("starting");
      const planned = cents("planned");
      if ([target, starting, planned].some((v) => Number.isNaN(v))) return setError("Check the amounts");
      const res = await saveGoalAction(
        {
          name: String(f.get("name") ?? ""),
          type: String(f.get("type")) as GoalType,
          targetCents: target,
          targetDate: String(f.get("targetDate") ?? "") || null,
          startingCents: starting ?? 0,
          startDate: String(f.get("startDate") ?? "") || undefined,
          plannedCents: planned,
          plannedPer: planned !== null ? (String(f.get("plannedPer")) as PlannedPer) : null,
          fundedByBucketId: bucketId || null,
          trackAccountId: counts.startsWith("account:") ? counts.slice(8) : null,
          trackCategoryId: counts.startsWith("category:") ? counts.slice(9) : null,
        },
        goal?.id,
      );
      if ("error" in res) return setError(res.error);
      if (goal) {
        const status = String(f.get("status") ?? goal.status) as GoalStatus;
        if (status !== goal.status) {
          const s = await setGoalStatusAction(goal.id, status);
          if ("error" in s) return setError(s.error);
        }
      }
      toast.success(goal ? "Saved" : `Added ${String(f.get("name"))}`);
      onDone();
    });

  const remove = () =>
    startTransition(async () => {
      if (!goal) return;
      const res = await deleteGoalAction(goal.id);
      if ("error" in res) {
        setConfirmDelete(false);
        setError(res.error);
      } else {
        toast.success(`${goal.name} deleted`);
        onDone();
      }
    });

  return (
    <form className="flex flex-col gap-4" action={save}>
      <DialogHeader>
        <DialogTitle>{goal ? `Edit ${goal.name}` : "Add a goal"}</DialogTitle>
        <DialogDescription>Only the name is required. Finnance tracks it from the money you move.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="goal-name">Name</Label>
          <Input id="goal-name" name="name" required maxLength={80} defaultValue={goal?.name ?? ""} placeholder="Emergency fund" />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="goal-type">Type</Label>
          <select id="goal-type" name="type" defaultValue={goal?.type ?? "savings"} className={selectClass}>
            {(Object.keys(TYPES) as GoalType[]).map((t) => (
              <option key={t} value={t}>
                {TYPES[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-target">Target</Label>
          <Input id="goal-target" name="target" inputMode="decimal" placeholder="Optional" defaultValue={toInput(goal?.targetCents ?? null)} className="num" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-target-date">Target date</Label>
          <Input id="goal-target-date" name="targetDate" type="date" defaultValue={goal?.targetDate ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-starting">Already saved</Label>
          <Input id="goal-starting" name="starting" inputMode="decimal" placeholder="0.00" defaultValue={toInput(goal?.startingCents ?? null)} className="num" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-start-date">as of</Label>
          <Input id="goal-start-date" name="startDate" type="date" defaultValue={goal?.startDate ?? defaultStartDate} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-planned">Plan to add</Label>
          <Input id="goal-planned" name="planned" inputMode="decimal" placeholder="Optional" defaultValue={toInput(goal?.plannedCents ?? null)} className="num" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-planned-per">Plan per</Label>
          <select id="goal-planned-per" name="plannedPer" defaultValue={goal?.plannedPer ?? "month"} className={selectClass}>
            <option value="month">per month</option>
            <option value="income">from each income</option>
          </select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="goal-bucket">Funded by</Label>
          <select
            id="goal-bucket"
            value={bucketId}
            onChange={(e) => {
              setBucketId(e.target.value);
              const dest = buckets.find((b) => b.id === e.target.value)?.destinationAccountId;
              if (dest && !counts) setCounts(`account:${dest}`);
            }}
            className={selectClass}
          >
            <option value="">None</option>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="goal-counts">Counts automatically</Label>
          <select id="goal-counts" value={counts} onChange={(e) => setCounts(e.target.value)} className={selectClass}>
            <option value="">None (add money by hand)</option>
            <optgroup label="Moves into">
              {accounts.map((a) => (
                <option key={a.id} value={`account:${a.id}`}>
                  Moves into {a.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Spending in">
              {categories.map((c) => (
                <option key={c.id} value={`category:${c.id}`}>
                  Spending in {c.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        {goal && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="goal-status">Status</Label>
            <select id="goal-status" name="status" defaultValue={goal.status} className={selectClass}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Done</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="gap-2 sm:justify-between">
        {goal ? (
          <Button type="button" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending}>
          Save
        </Button>
      </DialogFooter>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {goal?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Its history goes with it. Your transactions stay.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
