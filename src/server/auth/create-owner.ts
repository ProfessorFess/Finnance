import type { Auth } from "./auth";

const MIN_PASSWORD_LENGTH = 12;

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
