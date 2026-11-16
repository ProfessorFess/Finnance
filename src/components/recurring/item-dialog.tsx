"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteItem, saveItem } from "@/app/(app)/recurring/actions";
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
import { formatDisplayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { AMOUNT_MODE_LABELS, FREQUENCY_LABELS, INCOME_TYPE_LABELS, KIND_LABELS } from "@/lib/recurring-labels";
import type { AmountMode, IncomeType, RecurringKind } from "@/server/db/finance-schema";
import type { Frequency } from "@/server/recurring/schedule";

export type ItemDraft = Partial<{
  id: string;
  kind: "income" | RecurringKind;
  name: string;
  frequency: Frequency;
  anchorDate: string;
  secondDay: number | null;
  amountCents: number | null;
  amountMode: AmountMode;
  incomeType: IncomeType;
  amountVaries: boolean;
  accountId: string | null;
  categoryId: string | null;
  matchPattern: string;
  active: boolean;
  bucketId: string | null;
}>;

export type DialogOption = { id: string; name: string };
export type DialogCategory = DialogOption & { groupName: string };

type Kind = "income" | RecurringKind;
const KIND_DEFAULTS: Record<Kind, { frequency: Frequency; category: string | null }> = {
  income: { frequency: "biweekly", category: "Paycheck" },
  bill: { frequency: "monthly", category: null },
  subscription: { frequency: "monthly", category: "Subscriptions" },
  transfer: { frequency: "monthly", category: null },
};

const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm";
const centsToInput = (c: number | null | undefined) => (c ? (c / 100).toFixed(2) : "");

/** Add or edit a paycheck, bill, subscription, or recurring transfer. */
export function ItemDialog({
  open,
  onOpenChange,
  accounts,
  categories,
  initial,
  recent = [],
  onSaved,
  buckets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: DialogOption[];
  categories: DialogCategory[];
  initial?: ItemDraft;
  /** Latest matched transactions, shown when editing. */
  recent?: { date: string; amountCents: number }[];
  onSaved?: () => void;
  /** The plan's buckets a bill can be paid from, and the default for new bills. */
  buckets?: { options: DialogOption[]; defaultId: string | null };
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {open && <ItemForm accounts={accounts} categories={categories} initial={initial ?? {}} onDone={() => onOpenChange(false)} onSaved={onSaved} buckets={buckets} />}
        {open && recent.length > 0 && (
          <section className="border-t pt-4">
            <h3 className="mb-2 text-sm font-medium">Recent</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {recent.map((m) => (
                <li key={`${m.date}-${m.amountCents}`} className="flex justify-between text-muted-foreground">
                  <span>{formatDisplayDate(m.date)}</span>
                  <span className="num text-foreground">{formatCents(m.amountCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({
  accounts,
  categories,
  initial,
  onDone,
  onSaved,
  buckets,
}: {
  accounts: DialogOption[];
  categories: DialogCategory[];
  initial: ItemDraft;
  onDone: () => void;
  onSaved?: () => void;
  buckets?: { options: DialogOption[]; defaultId: string | null };
}) {
  const editing = Boolean(initial.id);
  const categoryIdByName = (name: string | null) => (name ? (categories.find((c) => c.name === name)?.id ?? "") : "");
  const startKind: Kind = initial.kind ?? "income";
  const [kind, setKind] = useState<Kind>(startKind);
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency ?? KIND_DEFAULTS[startKind].frequency);
  const [categoryId, setCategoryId] = useState<string>(initial.categoryId ?? (initial.id ? "" : categoryIdByName(KIND_DEFAULTS[startKind].category)));
  const [categoryTouched, setCategoryTouched] = useState(Boolean(initial.categoryId));
  const [frequencyTouched, setFrequencyTouched] = useState(Boolean(initial.frequency));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const income = kind === "income";

  const changeKind = (next: Kind) => {
    setKind(next);
    if (!frequencyTouched || (next !== "income" && frequency === "irregular")) setFrequency(KIND_DEFAULTS[next].frequency);
    if (!categoryTouched) setCategoryId(categoryIdByName(KIND_DEFAULTS[next].category));
  };

  const remove = () =>
    startTransition(async () => {
      if (!initial.id) return;
      const res = await deleteItem({ kind: income ? "income" : "recurring", id: initial.id });
      if ("error" in res) setError(res.error);
      else {
        toast.success(`${initial.name ?? "Item"} deleted`);
        onDone();
      }
    });

  const groups = [...new Set(categories.map((c) => c.groupName))];

  return (
    <form
      className="flex flex-col gap-4"
      action={(formData) =>
        startTransition(async () => {
          const res = await saveItem(formData);
          if ("error" in res) setError(res.error);
          else {
            setError(null);
            toast.success(editing ? "Saved" : `Tracking ${String(formData.get("name") ?? "it")}`);
            onSaved?.();
            onDone();
          }
        })
      }
    >
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${initial.name ?? "item"}` : "Track something that repeats"}</DialogTitle>
        <DialogDescription>Enter it once. Finnance expects it, matches it when it arrives, and flags it if it&apos;s late.</DialogDescription>
      </DialogHeader>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {editing && <input type="hidden" name="kind" value={kind} />}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-kind">Type</Label>
          <select
            id="item-kind"
            name={editing ? undefined : "kind"}
            value={kind}
            disabled={editing}
            onChange={(e) => changeKind(e.target.value as Kind)}
            className={selectClass}
          >
            {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-frequency">How often</Label>
          <select id="item-frequency" name="frequency" value={frequency} onChange={(e) => {
              setFrequency(e.target.value as Frequency);
              setFrequencyTouched(true);
            }} className={selectClass}>
            {(Object.keys(FREQUENCY_LABELS) as Frequency[])
              .filter((f) => income || f !== "irregular")
              .map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-name">Name</Label>
        <Input id="item-name" name="name" required maxLength={80} defaultValue={initial.name ?? ""} placeholder={income ? "Paycheck" : "Netflix"} />
      </div>

      {frequency !== "irregular" && (
        <div className={frequency === "semimonthly" ? "grid grid-cols-2 gap-3" : "flex flex-col gap-1.5"}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-anchor">First date</Label>
            <Input id="item-anchor" name="anchorDate" type="date" required defaultValue={initial.anchorDate ?? ""} />
            <p className="text-xs text-muted-foreground">Repeats from this date. Use a recent one.</p>
          </div>
          {frequency === "semimonthly" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-second-day">Second day</Label>
              <select id="item-second-day" name="secondDay" defaultValue={String(initial.secondDay ?? 31)} className={selectClass}>
                {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                <option value={31}>Last day</option>
              </select>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-amount">{frequency === "irregular" ? "Amount per month" : "Amount"}</Label>
          <Input
            id="item-amount"
            name="amount"
            inputMode="decimal"
            required={!income}
            defaultValue={centsToInput(initial.amountCents)}
            placeholder={income ? "Optional" : "0.00"}
            className="num"
          />
        </div>
        {income ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-amount-mode">Amount is</Label>
            <select id="item-amount-mode" name="amountMode" defaultValue={initial.amountMode ?? "varies"} className={selectClass}>
              {(Object.keys(AMOUNT_MODE_LABELS) as AmountMode[]).map((m) => (
                <option key={m} value={m}>
                  {AMOUNT_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <label className="flex items-end gap-2 pb-1.5 text-sm">
            <input type="checkbox" name="amountVaries" defaultChecked={initial.amountVaries ?? false} className="size-4 accent-primary" />
            Amount varies
          </label>
        )}
      </div>
      {income && <p className="-mt-2 text-xs text-muted-foreground">Leave it blank and Finnance takes it from your first matched deposit.</p>}

      {income && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-income-type">Income type</Label>
          <select id="item-income-type" name="incomeType" defaultValue={initial.incomeType ?? "salary"} className={selectClass}>
            {(Object.keys(INCOME_TYPE_LABELS) as IncomeType[]).map((t) => (
              <option key={t} value={t}>
                {INCOME_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-account">Account</Label>
          <select id="item-account" name="accountId" defaultValue={initial.accountId ?? ""} className={selectClass}>
            <option value="">Any account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-category">Category</Label>
          <select
            id="item-category"
            name="categoryId"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setCategoryTouched(true);
            }}
            className={selectClass}
          >
            <option value="">None</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {categories
                  .filter((c) => c.groupName === g)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {!income && buckets && buckets.options.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-bucket">Paid from</Label>
          <select
            id="item-bucket"
            name="bucketId"
            defaultValue={editing ? (initial.bucketId ?? "") : (initial.bucketId ?? (kind === "transfer" ? "" : (buckets.defaultId ?? "")))}
            className={selectClass}
          >
            {buckets.options.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
            <option value="">Not in my plan</option>
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-pattern">Match text</Label>
        <Input id="item-pattern" name="matchPattern" required maxLength={200} defaultValue={initial.matchPattern ?? ""} placeholder="Payroll Acme" />
        <p className="text-xs text-muted-foreground">Words in the bank description, like Payroll Acme.</p>
      </div>

      {editing && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="paused" defaultChecked={initial.active === false} className="mt-0.5 size-4 accent-primary" />
          <span>
            Paused
            <span className="block text-xs text-muted-foreground">Stop expecting it. Past matches stay.</span>
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="gap-2 sm:justify-between">
        {editing ? (
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
            <AlertDialogTitle>Delete {initial.name ?? "this item"}?</AlertDialogTitle>
            <AlertDialogDescription>Its transactions stay, but they won&apos;t be linked to anything.</AlertDialogDescription>
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
