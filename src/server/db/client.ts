import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/server/env";
import * as schema from "./schema";
import type { Database } from "./types";

let db: Database | undefined;

/** Lazily creates the shared connection pool and Drizzle instance. */
export function getDb(): Database {
  if (!db) {
    const pool = new Pool({ connectionString: getEnv().databaseUrl });
    if (process.env.VERCEL) attachDatabasePool(pool);
    db = drizzle(pool, { schema });
  }
  return db;
}
