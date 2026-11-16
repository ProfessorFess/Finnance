"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { skipStepAction } from "@/app/(app)/setup/actions";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { StartDateCard } from "@/components/accounts/start-date-card";
import { GoalDialog } from "@/components/goals/goal-dialog";
import type { BucketOption, Option } from "@/components/goals/types";
import { CreatePlan, type CreatePlanIncome, type CreatePlanTemplate } from "@/components/plan/create-plan";
import { type DialogCategory, ItemDialog } from "@/components/recurring/item-dialog";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import type { SetupStepKey } from "@/server/home/setup-service";
import { CommonSubscriptions } from "./common-subscriptions";

/** "Skip for now" until the step is done, then "Next". */
export function StepActions({ step, done, nextHref }: { step: SetupStepKey; done: boolean; nextHref: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
      {!done && (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await skipStepAction(step);
              if ("error" in res) toast.error(res.error);
              else router.push(nextHref);
            })
          }
        >
          Skip for now
        </Button>
      )}
      {done && (
        <Button asChild>
          <Link href={nextHref}>Next</Link>
        </Button>
      )}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Added({ items }: { items: { id: string; name: string; detail?: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y rounded-xl border">
      {items.map((i) => (
        <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="font-medium">{i.name}</span>
          {i.detail && <span className="num text-muted-foreground">{i.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

export function StartDateStep({ startDate }: { startDate: string | null }) {
  const router = useRouter();
  return (
    <>
      <Hint>Use the date of your most recent paycheck.</Hint>
      <StartDateCard startDate={startDate} onSaved={() => router.refresh()} />
    </>
  );
}

export function AccountsStep({ accounts, startDate }: { accounts: { id: string; name: string; balanceCents: number }[]; startDate: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Hint>Add each checking, savings, and credit card account. Use each balance as of your start date.</Hint>
      <Added items={accounts.map((a) => ({ id: a.id, name: a.name, detail: formatCents(a.balanceCents) }))} />
      <Button type="button" variant="outline" className="self-start" onClick={() => setOpen(true)}>
        <Plus /> Add account
      </Button>
      <AccountDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) router.refresh();
        }}
        account={null}
        startDate={startDate}
      />
    </>
  );
}

type ItemProps = {
  accounts: Option[];
  categories: DialogCategory[];
  buckets?: { options: Option[]; defaultId: string | null };
};

export function IncomeStep({ incomes, accounts, categories }: ItemProps & { incomes: { id: string; name: string; detail: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Hint>Paychecks, side income, anything that comes in. Not sure of the amount? Leave it blank — the first deposit fills it in.</Hint>
      <Added items={incomes} />
      <Button type="button" variant="outline" className="self-start" onClick={() => setOpen(true)}>
        <Plus /> Add income
      </Button>
      <ItemDialog open={open} onOpenChange={setOpen} accounts={accounts} categories={categories} initial={{ kind: "income" }} onSaved={() => router.refresh()} />
    </>
  );
}

export function PlanStep({
  planName,
  templates,
  incomes,
  accounts,
  billsMonthlyCents,
  today,
}: {
  planName: string | null;
  templates: CreatePlanTemplate[];
  incomes: CreatePlanIncome[];
  accounts: Option[];
  billsMonthlyCents: number;
  today: string;
}) {
  const router = useRouter();
  if (planName)
    return (
      <Hint>
        Your plan <span className="font-medium text-foreground">{planName}</span> is set up. Change it any time on the{" "}
        <Link href="/plan" className="text-primary underline">
          Plan
        </Link>{" "}
        page.
      </Hint>
    );
  if (incomes.length === 0)
    return <Hint>A plan splits the money you receive. Add your income first, or skip this and make a plan later.</Hint>;
  return (
    <CreatePlan templates={templates} incomes={incomes} accounts={accounts} billsMonthlyCents={billsMonthlyCents} today={today} onCreated={() => router.refresh()} />
  );
}

export function BillsStep({ bills, accounts, categories, buckets, today }: ItemProps & { bills: { id: string; name: string; detail: string }[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const have = new Set(bills.map((b) => b.name.toLowerCase()));
  return (
    <>
      <Hint>Pick the subscriptions you pay for. Prices are typical; change them to what you pay.</Hint>
      <CommonSubscriptions today={today} exclude={have} onAdded={() => router.refresh()} />
      <Added items={bills} />
      <Button type="button" variant="outline" className="self-start" onClick={() => setOpen(true)}>
        <Plus /> Add another bill
      </Button>
      <ItemDialog
        open={open}
        onOpenChange={setOpen}
        accounts={accounts}
        categories={categories}
        buckets={buckets}
        initial={{ kind: "bill" }}
        onSaved={() => router.refresh()}
      />
    </>
  );
}

export function GoalsStep({
  goals,
  defaultStartDate,
  accounts,
  categories,
  buckets,
}: {
  goals: { id: string; name: string; detail?: string }[];
  defaultStartDate: string;
  accounts: Option[];
  categories: Option[];
  buckets: BucketOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Hint>An emergency fund, a trip, paying off a card. Include what you&apos;ve already saved toward each.</Hint>
      <Added items={goals} />
      <Button type="button" variant="outline" className="self-start" onClick={() => setOpen(true)}>
        <Plus /> Add goal
      </Button>
      <GoalDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) router.refresh();
        }}
        goal={null}
        defaultStartDate={defaultStartDate}
        accounts={accounts}
        categories={categories}
        buckets={buckets}
      />
    </>
  );
}
