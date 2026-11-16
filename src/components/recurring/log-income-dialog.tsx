"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { logIncomeAction } from "@/app/(app)/recurring/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm";

/** Record income that isn't in a bank file yet. A later import replaces it with the bank's record. */
export function LogIncomeDialog({
  open,
  onOpenChange,
  source,
  accounts,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: { id: string; name: string; accountId: string | null } | null;
  accounts: { id: string; name: string }[];
  today: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        {open && source && (
          <form
            className="flex flex-col gap-4"
            action={(formData) =>
              startTransition(async () => {
                const res = await logIncomeAction(formData);
                if ("error" in res) setError(res.error);
                else {
                  toast.success(`Logged ${source.name}`);
                  onOpenChange(false);
                }
              })
            }
          >
            <DialogHeader>
              <DialogTitle>Log {source.name}</DialogTitle>
              <DialogDescription>For money that isn&apos;t in a bank file yet. When the bank&apos;s record arrives in an import, it replaces this entry.</DialogDescription>
            </DialogHeader>
            <input type="hidden" name="incomeSourceId" value={source.id} />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="log-amount">Amount</Label>
                <Input id="log-amount" name="amount" inputMode="decimal" required placeholder="0.00" className="num" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="log-date">Date</Label>
                <Input id="log-date" name="date" type="date" required defaultValue={today} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="log-account">Account</Label>
              <select id="log-account" name="accountId" required defaultValue={source.accountId ?? accounts[0]?.id ?? ""} className={selectClass}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="log-note">Note</Label>
              <Input id="log-note" name="note" maxLength={200} placeholder="Optional" />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
