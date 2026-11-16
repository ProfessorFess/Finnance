"use client";

import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDisplayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { PlanStatus } from "@/server/plan/status-service";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export function IncomeCard({ status, onLog }: { status: PlanStatus; onLog: () => void }) {
  const extraTo = status.latestIncome?.isExtra ? status.buckets.find((b) => b.fundedCents > 0)?.name : null;
  return (
    <section aria-label="Income" className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs">
      {status.problem === "no_income" ? (
        <p className="text-sm">
          This plan has no income. Choose one in Edit plan, or add it in{" "}
          <Link href="/recurring" className="text-primary underline">
            Recurring
          </Link>
          .
        </p>
      ) : status.month ? (
        <div>
          <p className="text-sm text-muted-foreground">{monthName(status.month.month)}</p>
          <p className="num text-3xl font-semibold">
            {formatCents(status.month.receivedCents)}{" "}
            <span className="text-base font-normal text-muted-foreground">
              {status.month.expectedCents !== null ? `of ≈ ${formatCents(status.month.expectedCents)} received` : "received"}
            </span>
          </p>
          {status.month.expectedCents === null && (
            <p className="mt-1 text-sm">
              Set a typical amount for your income in{" "}
              <Link href="/recurring" className="text-primary underline">
                Recurring
              </Link>
              , or log income as it arrives.
            </p>
          )}
        </div>
      ) : status.latestIncome ? (
        <div>
          <p className="text-sm text-muted-foreground">
            {status.latestIncome.sourceName} · {formatDisplayDate(status.latestIncome.date)}
          </p>
          <p className="num text-3xl font-semibold text-primary">{formatCents(status.latestIncome.amountCents)}</p>
          {extraTo && <p className="mt-1 text-sm">Extra paycheck · it all goes to {extraTo}</p>}
          {status.latestIncome.health.kind === "over" && (
            <p className="mt-1 text-sm text-destructive">This income is {formatCents(status.latestIncome.health.cents)} short of the plan.</p>
          )}
          {status.latestIncome.health.kind === "unassigned" && !status.latestIncome.isExtra && (
            <p className="mt-1 text-sm text-muted-foreground">{formatCents(status.latestIncome.health.cents)} of this income isn&apos;t assigned to a bucket.</p>
          )}
        </div>
      ) : (
        <p className="text-sm">Waiting for your first income.</p>
      )}

      {status.tasks.length > 0 && (
        <ul className="flex flex-col gap-2">
          {status.tasks.map((t) => (
            <li key={t.bucketId} className="flex items-center gap-2 text-sm">
              {t.done ? <CheckCircle2 className="size-4 text-primary" /> : <Circle className="size-4 text-muted-foreground" />}
              <span className="flex-1">
                Move <span className="num font-medium">{formatCents(t.amountCents)}</span> to {t.destinationAccountName}
              </span>
              {!t.done && (
                <span className="num text-xs text-muted-foreground">
                  {formatCents(t.movedCents)} of {formatCents(t.amountCents)} moved
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {status.nextExpected
            ? `Next: ${status.nextExpected.sourceName} ${formatDisplayDate(status.nextExpected.date)}${status.nextExpected.amountCents !== null ? `, ≈ ${formatCents(status.nextExpected.amountCents)}` : ""}`
            : ""}
        </span>
        {status.incomes.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={onLog}>
            Log income
          </Button>
        )}
      </div>
    </section>
  );
}
