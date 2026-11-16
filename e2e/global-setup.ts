import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createAuth } from "../src/server/auth/auth";
import { createOwner } from "../src/server/auth/create-owner";
import { createAccount } from "../src/server/finance/accounts";
import { setTrackingStartDate } from "../src/server/finance/settings";
import { commitImport } from "../src/server/import/service";
import { createIncomeSource, createRecurringRule } from "../src/server/recurring/items-service";
import { listCategories } from "../src/server/finance/categories";
import { createPlan } from "../src/server/plan/plans-service";
import { templateDrafts } from "../src/server/plan/templates";
import * as schema from "../src/server/db/schema";
import { assertSafeE2EDatabase } from "../src/test/e2e-db-guard";
import { insertTestTransaction } from "../src/test/users";
import { E2E_ENV } from "./env";
import {
  ACCOUNTS_USER,
  IMPORT_USER,
  LEARN_USER,
  NOSTART_USER,
  OWNER,
  REVIEW_USER,
  REVIEW_USER_M,
  PLAN_EDIT_USER,
  PLAN_SCRATCH_USER,
  PLAN_TWO_USER,
  PLAN_USER,
  RECURRING_LOG_USER,
  RECURRING_TRACK_USER,
  RECURRING_USER,
  RULES_USER,
  SORT_USER,
  TRANSFER_USER,
  TWOFA_USER,
  TXN_USER,
} from "./fixtures";

const FIXTURES = "src/server/import/__fixtures__";
type AccountSpec = { name: string; type: "checking" | "savings"; file: string };
const CHECKING: AccountSpec = { name: "UFCU Checking", type: "checking", file: "ufcu-checking.csv" };
const SAVINGS: AccountSpec = { name: "UFCU Savings", type: "savings", file: "ufcu-savings.csv" };

export default async function globalSetup() {
  assertSafeE2EDatabase(E2E_ENV.DATABASE_URL);
  const pool = new Pool({ connectionString: E2E_ENV.DATABASE_URL });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.execute(sql`TRUNCATE "user", "rate_limit", "verification" CASCADE`);
  const auth = createAuth(db, {
    baseURL: E2E_ENV.BETTER_AUTH_URL,
    secret: E2E_ENV.BETTER_AUTH_SECRET,
    allowSignup: false,
  });
  await createOwner(auth, OWNER);
  await createOwner(auth, TWOFA_USER);
  await createOwner(auth, ACCOUNTS_USER);
  const importUser = await createOwner(auth, IMPORT_USER);
  await setTrackingStartDate(db, importUser.id, "2026-11-07");
  await createAccount(db, importUser.id, { name: "UFCU Checking", type: "checking", institution: "UFCU", startingBalanceCents: 0 });
  await createAccount(db, importUser.id, { name: "Ally Spending", type: "checking", institution: "Ally", startingBalanceCents: 0 });
  // Users with UFCU fixture files imported (no AI key in e2e, so unsorted rows need review).
  const seeded = async (user: { name: string; email: string; password: string }, accounts: AccountSpec[]) => {
    const { id } = await createOwner(auth, user);
    await setTrackingStartDate(db, id, "2026-11-07");
    const created = [];
    for (const a of accounts) {
      const acct = await createAccount(db, id, { name: a.name, type: a.type, institution: "UFCU", startingBalanceCents: 0 });
      await commitImport(db, id, { file: { name: a.file, bytes: new Uint8Array(readFileSync(`${FIXTURES}/${a.file}`)) }, accountId: acct.id }, { ai: null });
      created.push(acct);
    }
    return { id, accounts: created };
  };
  await seeded(TXN_USER, [CHECKING]);
  await seeded(TRANSFER_USER, [CHECKING, SAVINGS]);
  await seeded(LEARN_USER, [CHECKING]);
  await seeded(REVIEW_USER, [CHECKING]);
  await seeded(REVIEW_USER_M, [CHECKING]);
  await seeded(RULES_USER, [CHECKING]);
  await seeded(RECURRING_USER, [CHECKING]);
  await seeded(RECURRING_TRACK_USER, [CHECKING]);
  const logUser = await seeded(RECURRING_LOG_USER, [CHECKING]);
  await createIncomeSource(db, logUser.id, {
    name: "Tips", type: "side_income", frequency: "irregular", anchorDate: null, secondDay: null, amountMode: "varies",
    expectedCents: null, accountId: logUser.accounts[0]!.id, categoryId: null, matchPattern: "Tips",
  });

  // Budget plans: a paycheck with Ally accounts to move money to, and someone with only irregular income.
  const planUser = await seeded(PLAN_USER, [CHECKING]);
  await createAccount(db, planUser.id, { name: "Ally Savings", type: "savings", institution: "Ally", startingBalanceCents: 0 });
  await createAccount(db, planUser.id, { name: "Ally Spending", type: "checking", institution: "Ally", startingBalanceCents: 0 });
  await createIncomeSource(db, planUser.id, {
    name: "Paycheck", type: "salary", frequency: "biweekly", anchorDate: "2026-11-14", secondDay: null, amountMode: "fixed",
    expectedCents: 120000, accountId: planUser.accounts[0]!.id, categoryId: null, matchPattern: "Payroll Acme Corp",
  });
  await createRecurringRule(db, planUser.id, {
    name: "Prime Video", kind: "subscription", frequency: "monthly", anchorDate: "2026-11-14", secondDay: null, expectedCents: 2164,
    amountVaries: false, toleranceCents: null, accountId: planUser.accounts[0]!.id, categoryId: null, matchPattern: "Prime Video",
  });
  const editUser = await seeded(PLAN_EDIT_USER, [CHECKING]);
  const editSav = await createAccount(db, editUser.id, { name: "Ally Savings", type: "savings", institution: "Ally", startingBalanceCents: 0 });
  const editSpend = await createAccount(db, editUser.id, { name: "Ally Spending", type: "checking", institution: "Ally", startingBalanceCents: 0 });
  const editPay = await createIncomeSource(db, editUser.id, {
    name: "Paycheck", type: "salary", frequency: "biweekly", anchorDate: "2026-11-14", secondDay: null, amountMode: "fixed",
    expectedCents: 120000, accountId: editUser.accounts[0]!.id, categoryId: null, matchPattern: "Payroll Acme Corp",
  });
  await createRecurringRule(db, editUser.id, {
    name: "Prime Video", kind: "subscription", frequency: "monthly", anchorDate: "2026-11-14", secondDay: null, expectedCents: 2164,
    amountVaries: false, toleranceCents: null, accountId: editUser.accounts[0]!.id, categoryId: null, matchPattern: "Prime Video",
  });
  const editDrafts = templateDrafts("paycheck_plan", await listCategories(db, editUser.id));
  editDrafts.buckets[0] = { ...editDrafts.buckets[0]!, fundingCents: 40000, destinationAccountId: editSav.id };
  editDrafts.buckets[2] = { ...editDrafts.buckets[2]!, fundingCents: 40000, limitCents: 20000, destinationAccountId: editSpend.id };
  await createPlan(db, editUser.id, {
    template: "paycheck_plan", cadence: "per_income", name: "Paycheck plan", incomeSourceIds: [editPay.id],
    buckets: editDrafts.buckets, extraIncome: { bucketIndex: 0, incomeSourceId: editPay.id },
  });
  const twoUser = await seeded(PLAN_TWO_USER, [CHECKING]);
  const dayJob = await createIncomeSource(db, twoUser.id, {
    name: "Day job", type: "salary", frequency: "semimonthly", anchorDate: "2026-11-15", secondDay: 31, amountMode: "fixed",
    expectedCents: 150000, accountId: twoUser.accounts[0]!.id, categoryId: null, matchPattern: "Acme Payroll",
  });
  const tips = await createIncomeSource(db, twoUser.id, {
    name: "Tips", type: "side_income", frequency: "irregular", anchorDate: null, secondDay: null, amountMode: "varies",
    expectedCents: 20000, accountId: twoUser.accounts[0]!.id, categoryId: null, matchPattern: "Tips",
  });
  await createPlan(db, twoUser.id, {
    template: "custom", cadence: "monthly", name: "Our budget", incomeSourceIds: [dayJob.id, tips.id], extraIncome: null,
    buckets: templateDrafts("custom", []).buckets,
  });
  const scratchUser = await seeded(PLAN_SCRATCH_USER, [CHECKING]);
  await createIncomeSource(db, scratchUser.id, {
    name: "Side gigs", type: "side_income", frequency: "irregular", anchorDate: null, secondDay: null, amountMode: "varies",
    expectedCents: 50000, accountId: scratchUser.accounts[0]!.id, categoryId: null, matchPattern: "Venmo",
  });

  // Rows as Phase 1a left them: never sorted (no source, no merchant, not flagged for review).
  const sortUser = await createOwner(auth, SORT_USER);
  await setTrackingStartDate(db, sortUser.id, "2026-11-07");
  const sortAcct = await createAccount(db, sortUser.id, { name: "UFCU Checking", type: "checking", institution: "UFCU", startingBalanceCents: 0 });
  for (const description of ["Haymaker", "Corner Store", "Starbucks"]) {
    await insertTestTransaction(db, sortUser.id, sortAcct.id, { amountCents: -700, date: "2026-11-10", description });
  }
  await createOwner(auth, NOSTART_USER);
  await pool.end();
}
