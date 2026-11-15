"use client";

import { EllipsisVertical, Landmark, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveAccountAction } from "@/app/(app)/accounts/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCents } from "@/lib/money";
import { AccountDialog, type EditableAccount, TYPE_LABELS } from "./account-dialog";

export type AccountListItem = EditableAccount & { balanceCents: number; lastImportAt: string | null };

export function AccountList({ accounts, startDate }: { accounts: AccountListItem[]; startDate: string | null }) {
  const [dialog, setDialog] = useState<{ open: boolean; account: EditableAccount | null }>({ open: false, account: null });
  const [, startTransition] = useTransition();
  const total = accounts.reduce((sum, a) => sum + a.balanceCents, 0);

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Your accounts</h2>
          {accounts.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Total <span className="num font-medium text-foreground">{formatCents(total)}</span>
            </p>
          )}
        </div>
        <Button onClick={() => setDialog({ open: true, account: null })}>
          <Plus /> Add account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
          <Landmark className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Add the accounts you&apos;ll import from, with each one&apos;s balance on your start date.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => setDialog({ open: true, account: null })}>
            <Plus /> Add account
          </Button>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0 sm:px-5">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Landmark className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[a.institution, TYPE_LABELS[a.type] ?? a.type, a.lastFour ? `•••• ${a.lastFour}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                  {" · "}
                  {a.lastImportAt ? `Last import ${new Date(a.lastImportAt).toLocaleDateString()}` : "No imports yet"}
                </p>
              </div>
              <p className="num text-right font-medium">{formatCents(a.balanceCents)}</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Options for ${a.name}`}>
                    <EllipsisVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialog({ open: true, account: a })}>Edit</DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      startTransition(async () => {
                        const res = await archiveAccountAction(a.id);
                        if (res.ok) toast.success(`${a.name} archived`);
                        else toast.error(res.error);
                      })
                    }
                  >
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <AccountDialog
        key={dialog.account?.id ?? "new"}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        account={dialog.account}
        startDate={startDate}
      />
    </section>
  );
}
