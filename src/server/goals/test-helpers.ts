import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { transactions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { listCategories } from "@/server/finance/categories";
import { createPlan } from "@/server/plan/plans-service";
import { templateDrafts } from "@/server/plan/templates";
import { createIncomeSource } from "@/server/recurring/items-service";
import { insertTestTransaction } from "@/test/users";

/** A move between two of the user's accounts (a transfer pair); returns the inflow side. */
export async function transferPair(db: Database, userId: string, fromId: string, toId: string, date: string, cents: number) {
  const pairId = randomUUID();
  const out = await insertTestTransaction(db, userId, fromId, { amountCents: -cents, date, description: "Transfer out" });
  const inn = await insertTestTransaction(db, userId, toId, { amountCents: cents, date, description: "Transfer in" });
  for (const id of [out.id, inn.id]) await db.update(transactions).set({ transferPairId: pairId }).where(eq(transactions.id, id));
  return inn;
}

/** The owner's paycheck plan: Savings & investing gets $400 from each biweekly paycheck and moves to `savingsId`. */
export async function ownerPlan(db: Database, userId: string, checkingId: string, savingsId: string) {
  const pay = await createIncomeSource(db, userId, {
    name: "Paycheck", type: "salary", frequency: "biweekly", anchorDate: "2026-11-13", secondDay: null, amountMode: "fixed",
    expectedCents: 120_000, accountId: checkingId, categoryId: null, matchPattern: "Payroll Acme",
  });
  const d = templateDrafts("paycheck_plan", await listCategories(db, userId));
  d.buckets[0] = { ...d.buckets[0]!, fundingCents: 40_000, destinationAccountId: savingsId };
  d.buckets[2] = { ...d.buckets[2]!, fundingCents: 40_000, limitCents: 20_000 };
  await createPlan(db, userId, { template: "paycheck_plan", cadence: "per_income", name: "Paycheck plan", incomeSourceIds: [pay.id], buckets: d.buckets, extraIncome: null });
}
