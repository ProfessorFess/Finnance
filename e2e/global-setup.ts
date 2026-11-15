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
import * as schema from "../src/server/db/schema";
import { assertSafeE2EDatabase } from "../src/test/e2e-db-guard";
import { E2E_ENV } from "./env";
import {
  ACCOUNTS_USER,
  IMPORT_USER,
  LEARN_USER,
  NOSTART_USER,
  OWNER,
  REVIEW_USER,
  REVIEW_USER_M,
  RULES_USER,
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
    for (const a of accounts) {
      const acct = await createAccount(db, id, { name: a.name, type: a.type, institution: "UFCU", startingBalanceCents: 0 });
      await commitImport(db, id, { file: { name: a.file, bytes: new Uint8Array(readFileSync(`${FIXTURES}/${a.file}`)) }, accountId: acct.id }, { ai: null });
    }
  };
  await seeded(TXN_USER, [CHECKING]);
  await seeded(TRANSFER_USER, [CHECKING, SAVINGS]);
  await seeded(LEARN_USER, [CHECKING]);
  await seeded(REVIEW_USER, [CHECKING]);
  await seeded(REVIEW_USER_M, [CHECKING]);
  await seeded(RULES_USER, [CHECKING]);
  await createOwner(auth, NOSTART_USER);
  await pool.end();
}
