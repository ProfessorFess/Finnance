"use client";

import { useState } from "react";
import { LogIncomeDialog } from "@/components/recurring/log-income-dialog";
import { Label } from "@/components/ui/label";
import type { PlanStatus } from "@/server/plan/status-service";
import { BucketCard } from "./bucket-card";
import { HealthChip } from "./health-chip";
import { IncomeCard } from "./income-card";

export type BoardIncome = { id: string; name: string; accountId: string | null };

export function PlanBoard({ status, incomes, accounts }: { status: PlanStatus; incomes: BoardIncome[]; accounts: { id: string; name: string }[] }) {
  const [logging, setLogging] = useState(false);
  const [sourceId, setSourceId] = useState(incomes[0]?.id ?? "");
  const source = incomes.find((i) => i.id === sourceId) ?? null;
  return (
    <div className="flex flex-col gap-6">
      <IncomeCard status={status} onLog={() => setLogging(true)} />
      <HealthChip health={status.health} typicalCents={status.typicalIncomeCents} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {status.buckets.map((b) => (
          <BucketCard key={b.id} bucket={b} cadence={status.plan.cadence} />
        ))}
      </ul>
      {incomes.length > 1 && logging && (
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="log-source">Log income for</Label>
          <select id="log-source" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
            {incomes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <LogIncomeDialog open={logging} onOpenChange={setLogging} source={source} accounts={accounts} today={status.today} />
    </div>
  );
}
