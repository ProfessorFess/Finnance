"use client";

import { useState, useTransition } from "react";
import { saveAccount } from "@/app/(app)/accounts/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDisplayDate } from "@/lib/dates";

export type EditableAccount = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  lastFour: string | null;
  startingBalanceCents: number;
};

const TYPE_LABELS: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  cash: "Cash",
  loan: "Loan",
  investment: "Investment",
  other: "Other",
};

const centsToInput = (c: number) => (c / 100).toFixed(2);

export function AccountDialog({
  open,
  onOpenChange,
  account,
  startDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: EditableAccount | null;
  startDate: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const balanceLabel = startDate ? `Balance on ${formatDisplayDate(startDate)}` : "Starting balance";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          action={(formData) =>
            startTransition(async () => {
              const res = await saveAccount(formData);
              if (res.ok) {
                setError(null);
                onOpenChange(false);
              } else setError(res.error);
            })
          }
        >
          <DialogHeader>
            <DialogTitle>{account ? "Edit account" : "Add account"}</DialogTitle>
            <DialogDescription>
              {startDate
                ? "Use the balance at the start of your tracking start date (the end of the day before)."
                : "Set your tracking start date first so this balance lines up with your imports."}
            </DialogDescription>
          </DialogHeader>
          {account && <input type="hidden" name="id" value={account.id} />}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acct-name">Name</Label>
            <Input id="acct-name" name="name" required defaultValue={account?.name} placeholder="UFCU Checking" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acct-type">Type</Label>
              <select
                id="acct-type"
                name="type"
                defaultValue={account?.type ?? "checking"}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acct-bank">Bank</Label>
              <Input id="acct-bank" name="institution" defaultValue={account?.institution ?? ""} placeholder="UFCU" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acct-balance">{balanceLabel}</Label>
              <Input
                id="acct-balance"
                name="balance"
                inputMode="decimal"
                required
                defaultValue={account ? centsToInput(account.startingBalanceCents) : ""}
                placeholder="0.00"
                className="num"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acct-last4">Last four digits (optional)</Label>
              <Input
                id="acct-last4"
                name="lastFour"
                inputMode="numeric"
                maxLength={4}
                defaultValue={account?.lastFour ?? ""}
                className="num"
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Save account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { TYPE_LABELS };
