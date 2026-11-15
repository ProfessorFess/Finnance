import { randomBytes } from "node:crypto";
import type { Database } from "@/server/db/types";
import { createAuth, type Auth } from "./auth";

const MIN_PASSWORD_LENGTH = 12;

/**
 * An auth instance good enough for creating logins, built from the database alone.
 * Password hashes (scrypt) don't depend on BETTER_AUTH_SECRET, so the owner CLI
 * works even though Vercel won't export "Sensitive" variables like the secret.
 * Never use this instance to serve requests.
 */
export function createOwnerAuth(db: Database): Auth {
  return createAuth(db, {
    baseURL: "http://localhost",
    secret: randomBytes(32).toString("hex"),
    allowSignup: false,
  });
}

/** The database URL for the owner CLI, preferring the direct (unpooled) connection. */
export function parseOwnerDatabaseUrl(env: Record<string, string | undefined>): string {
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  let ok = false;
  try {
    ok = url !== undefined && /^postgres(ql)?:$/.test(new URL(url).protocol);
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new Error(
      "DATABASE_URL is missing or isn't a Postgres URL. Copy the connection string from the Neon console (Vercel → Storage → your database) into the env file as DATABASE_URL.",
    );
  }
  return url!;
}

/**
 * Creates a login directly, bypassing the (closed) signup endpoint.
 * Used by the `pnpm create-owner` CLI and e2e setup.
 */
export async function createOwner(
  auth: Auth,
  input: { name: string; email: string; password: string },
): Promise<{ id: string; email: string }> {
  const email = input.email.trim().toLowerCase();
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const ctx = await auth.$context;
  if (await ctx.internalAdapter.findUserByEmail(email)) {
    throw new Error("A user with this email already exists");
  }

  const user = await ctx.internalAdapter.createUser(
    { name: input.name.trim(), email, emailVerified: true },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  });
  return { id: user.id, email: user.email };
}
