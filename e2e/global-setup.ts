import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createAuth } from "../src/server/auth/auth";
import { createOwner } from "../src/server/auth/create-owner";
import { createAccount } from "../src/server/finance/accounts";
import { setTrackingStartDate } from "../src/server/finance/settings";
import * as schema from "../src/server/db/schema";
import { assertSafeE2EDatabase } from "../src/test/e2e-db-guard";
import { E2E_ENV } from "./env";
import { ACCOUNTS_USER, IMPORT_USER, NOSTART_USER, OWNER, TWOFA_USER, TXN_USER } from "./fixtures";

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
  await createOwner(auth, TXN_USER);
  await createOwner(auth, NOSTART_USER);
  await pool.end();
}
