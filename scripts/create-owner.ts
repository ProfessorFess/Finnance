/**
 * Creates the owner's login. The owner runs this themselves and types their
 * own password; it is never printed or logged.
 *
 *   pnpm create-owner                                  # uses .env.local
 *   pnpm create-owner --env-file .env.production.local
 *
 * Only the database URL is needed. Vercel won't export "Sensitive" variables
 * (like BETTER_AUTH_SECRET), and creating a login doesn't need them.
 */
import { existsSync } from "node:fs";
import { input, password } from "@inquirer/prompts";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createOwner, createOwnerAuth, parseOwnerDatabaseUrl } from "@/server/auth/create-owner";
import * as schema from "@/server/db/schema";

function envFileArg(): string {
  const i = process.argv.indexOf("--env-file");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : ".env.local";
}

async function main() {
  const envFile = envFileArg();
  if (!existsSync(envFile)) throw new Error(`Env file not found: ${envFile}`);
  const { parsed = {} } = config({ path: envFile, quiet: true, processEnv: {} });
  const pool = new Pool({ connectionString: parseOwnerDatabaseUrl(parsed) });

  try {
    const auth = createOwnerAuth(drizzle(pool, { schema }));

    const name = await input({ message: "Your name:", required: true });
    const email = await input({ message: "Email:", required: true });
    const pw = await password({
      message: "Password (12+ characters):",
      mask: true,
      validate: (v) => v.length >= 12 || "Use at least 12 characters",
    });
    const confirm = await password({ message: "Confirm password:", mask: true });
    if (pw !== confirm) throw new Error("Passwords don't match");

    const owner = await createOwner(auth, { name, email, password: pw });
    console.log(`Owner created: ${owner.email}`);
  } finally {
    await pool.end();
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : "Failed to create owner");
    process.exit(1);
  },
);
