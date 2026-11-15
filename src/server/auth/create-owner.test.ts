import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createAuth, type Auth } from "./auth";
import { createOwner } from "./create-owner";

let t: Awaited<ReturnType<typeof createTestDb>>;
let auth: Auth;
const input = { name: "Owner", email: "owner@example.com", password: "a-long-test-password" };

beforeEach(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { baseURL: "http://localhost:3000", secret: "s".repeat(32), allowSignup: false });
});
afterEach(async () => {
  await t.close();
});

describe("createOwner", () => {
  it("creates a user who can sign in while signup is closed", async () => {
    await createOwner(auth, input);
    const res = await auth.api.signInEmail({ body: { email: input.email, password: input.password } });
    expect(res.user.email).toBe("owner@example.com");
  });

  it("normalizes the email", async () => {
    const created = await createOwner(auth, { ...input, email: "  Owner@Example.COM " });
    expect(created.email).toBe("owner@example.com");
  });

  it("refuses a duplicate email", async () => {
    await createOwner(auth, input);
    await expect(createOwner(auth, input)).rejects.toThrow(/already exists/);
  });

  it("refuses passwords shorter than 12 characters", async () => {
    await expect(createOwner(auth, { ...input, password: "short-pass1" })).rejects.toThrow(/at least 12/);
  });
});
