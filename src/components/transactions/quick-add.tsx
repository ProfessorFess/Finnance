"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { addTransaction } from "@/app/(app)/transactions/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { TransactionRow } from "@/server/finance/transactions";

function today(timezone: string): string {
  // en-CA formats as YYYY-MM-DD; the timezone keeps "today" right for the user.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

/** Adds a transaction by hand (cash, or anything not in a bank file). */
export function QuickAdd({
  accounts,
  timezone,
  onAdded,
}: {
  accounts: { id: string; name: string }[];
  timezone: string;
  onAdded: (row: TransactionRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={accounts.length === 0}>
        <Plus /> Add transaction
      </Button>
      <Dialog open={open} onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}>
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            action={(formData) =>
              startTransition(async () => {
                formData.set("direction", direction);
                const res = await addTransaction(formData);
                if ("error" in res) return setError(res.error);
                onAdded(res);
                setError(null);
                setOpen(false);
              })
            }
          >
            <DialogHeader>
              <DialogTitle>Add transaction</DialogTitle>
              <DialogDescription>For cash or anything that won&apos;t show up in a bank file.</DialogDescription>
            </DialogHeader>
            <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
              {(["out", "in"] as const).map((d) => (
                <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)}
                  className={cn("rounded-md py-1.5 transition-colors", direction === d ? "bg-card font-medium shadow-xs" : "text-muted-foreground")}>
                  {d === "out" ? "Money out" : "Money in"}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-desc">Description</Label>
              <Input id="qa-desc" name="description" required placeholder="Farmers market" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="qa-amount">Amount</Label>
                <Input id="qa-amount" name="amount" inputMode="decimal" required placeholder="0.00" className="num" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="qa-date">Date</Label>
                <Input id="qa-date" name="date" type="date" required defaultValue={today(timezone)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-account">Account</Label>
              <select id="qa-account" name="accountId" required defaultValue={accounts[0]?.id}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
