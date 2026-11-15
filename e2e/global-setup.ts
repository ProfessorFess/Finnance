import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createAuth } from "../src/server/auth/auth";
import { createOwner } from "../src/server/auth/create-owner";
import * as schema from "../src/server/db/schema";
import { assertSafeE2EDatabase } from "../src/test/e2e-db-guard";
import { E2E_ENV } from "./env";
import { OWNER, TWOFA_USER } from "./fixtures";

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
  await pool.end();
}
