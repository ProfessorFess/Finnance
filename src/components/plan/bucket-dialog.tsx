"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteBucketAction, saveBucketAction } from "@/app/(app)/plan/actions";
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
import type { BucketRole, FundingType, LimitPeriod, PlanCadence } from "@/server/db/finance-schema";
import type { BucketDraft } from "@/server/plan/templates";

const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm";
const toInput = (c: number | null) => (c ? (c / 100).toFixed(2) : "");
const ROLE_LABELS: Record<BucketRole, string> = { spending: "Spending", bills: "Bills", savings: "Savings", goal: "Goal", buffer: "Buffer" };
const FUNDING_LABELS: Record<FundingType, string> = { fixed: "Fixed amount", percent: "Percent", sum_of_recurring: "Its bills", remainder: "What's left" };
const PERIOD_LABELS: Record<LimitPeriod, string> = { weekly: "per week", monthly: "per month", per_income: "since last income" };

export type DialogCategory = { id: string; name: string; groupName: string };

/** Add or edit one bucket of the plan. */
export function BucketDialog({
  open,
  onOpenChange,
  planId,
  cadence,
  bucket,
  accounts,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  cadence: PlanCadence;
  bucket: { id: string; draft: BucketDraft } | null;
  accounts: { id: string; name: string }[];
  categories: DialogCategory[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {open && <BucketForm planId={planId} cadence={cadence} bucket={bucket} accounts={accounts} categories={categories} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

const blank: BucketDraft = {
  name: "",
  role: "spending",
  icon: "wallet",
  fundingType: "fixed",
  fundingCents: null,
  fundingBps: null,
  limitCents: null,
  limitPeriod: null,
  trackCategoryIds: [],
  destinationAccountId: null,
};

function BucketForm({
  planId,
  cadence,
  bucket,
  accounts,
  categories,
  onDone,
}: {
  planId: string;
  cadence: PlanCadence;
  bucket: { id: string; draft: BucketDraft } | null;
  accounts: { id: string; name: string }[];
  categories: DialogCategory[];
  onDone: () => void;
}) {
  const start = bucket?.draft ?? blank;
  const [role, setRole] = useState<BucketRole>(start.role);
  const [funding, setFunding] = useState<FundingType>(start.fundingType);
  const [tracked, setTracked] = useState<Set<string>>(new Set(start.trackCategoryIds));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const groups = [...new Set(categories.map((c) => c.groupName))];

  const save = (form: FormData) =>
    startTransition(async () => {
      const amount = parseAmountToCents(String(form.get("amount") ?? ""));
      const limit = parseAmountToCents(String(form.get("limit") ?? ""));
      const percentText = String(form.get("percent") ?? "").trim();
      const hasLimit = limit !== null && limit > 0;
      const draft: BucketDraft = {
        name: String(form.get("name") ?? ""),
        role,
        icon: start.icon,
        fundingType: funding,
        fundingCents: funding === "fixed" && amount !== null ? Math.abs(amount) : null,
        fundingBps: funding === "percent" && percentText ? Math.round(Number(percentText) * 100) : null,
        limitCents: hasLimit ? limit : null,
        limitPeriod: hasLimit ? (String(form.get("limitPeriod")) as LimitPeriod) : null,
        trackCategoryIds: [...tracked],
        destinationAccountId: String(form.get("destinationAccountId") ?? "") || null,
      };
      const res = await saveBucketAction(planId, draft, bucket?.id);
      if ("error" in res) setError(res.error);
      else {
        toast.success(bucket ? "Saved" : `Added ${draft.name}`);
        onDone();
      }
    });

  const remove = () =>
    startTransition(async () => {
      if (!bucket) return;
      const res = await deleteBucketAction(bucket.id);
      if ("error" in res) {
        setConfirmDelete(false);
        setError(res.error);
      } else {
        toast.success(`${start.name} deleted`);
        onDone();
      }
    });

  return (
    <form className="flex flex-col gap-4" action={save}>
      <DialogHeader>
        <DialogTitle>{bucket ? `Edit ${start.name}` : "Add a bucket"}</DialogTitle>
        <DialogDescription>What it gets from {cadence === "monthly" ? "each month" : "each income"}, and what it can spend.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="bucket-name">Name</Label>
          <Input id="bucket-name" name="name" required maxLength={80} defaultValue={start.name} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bucket-role">Kind</Label>
          <select id="bucket-role" value={role} onChange={(e) => setRole(e.target.value as BucketRole)} className={selectClass}>
            {(Object.keys(ROLE_LABELS) as BucketRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bucket-funding">Gets</Label>
          <select id="bucket-funding" value={funding} onChange={(e) => setFunding(e.target.value as FundingType)} className={selectClass}>
            {(Object.keys(FUNDING_LABELS) as FundingType[]).map((f) => (
              <option key={f} value={f}>
                {FUNDING_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        {funding === "fixed" && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="bucket-amount">Amount</Label>
            <Input id="bucket-amount" name="amount" inputMode="decimal" required defaultValue={toInput(start.fundingCents)} className="num" />
            <p className="text-xs text-muted-foreground">{cadence === "monthly" ? "Each month." : "From each income."}</p>
          </div>
        )}
        {funding === "percent" && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="bucket-percent">Percent</Label>
            <Input id="bucket-percent" name="percent" inputMode="decimal" required defaultValue={start.fundingBps ? String(start.fundingBps / 100) : ""} className="num" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bucket-limit">Limit</Label>
          <Input id="bucket-limit" name="limit" inputMode="decimal" placeholder="None" defaultValue={toInput(start.limitCents)} className="num" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bucket-limit-period">Limit period</Label>
          <select id="bucket-limit-period" name="limitPeriod" defaultValue={start.limitPeriod ?? (cadence === "monthly" ? "monthly" : "weekly")} className={selectClass}>
            {(Object.keys(PERIOD_LABELS) as LimitPeriod[]).map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="bucket-destination">Move to</Label>
          <select id="bucket-destination" name="destinationAccountId" defaultValue={start.destinationAccountId ?? ""} className={selectClass}>
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {role !== "savings" && role !== "goal" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Counts spending in</legend>
          {groups.map((g) => (
            <div key={g}>
              <p className="text-xs text-muted-foreground">{g}</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {categories
                  .filter((c) => c.groupName === g)
                  .map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={tracked.has(c.id)}
                        onChange={(e) =>
                          setTracked((set) => {
                            const next = new Set(set);
                            if (e.target.checked) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          })
                        }
                        className="size-4 accent-primary"
                      />
                      {c.name}
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </fieldset>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="gap-2 sm:justify-between">
        {bucket ? (
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
            <AlertDialogTitle>Delete {start.name}?</AlertDialogTitle>
            <AlertDialogDescription>Its transactions stay. Bills paid from it won&apos;t be in a bucket until you choose one.</AlertDialogDescription>
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
