import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** A Drizzle Postgres database over Finnance's schema (node-postgres in the app, PGlite in tests). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** A database or an open transaction, for helpers that run inside either. */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
