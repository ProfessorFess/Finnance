import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createAuth, type Auth } from "./auth";
import { createOwner, createOwnerAuth, parseOwnerDatabaseUrl } from "./create-owner";

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

  it("works with only the database: a login made without the app's secret signs in to the real app", async () => {
    // The CLI can't read Vercel's "Sensitive" BETTER_AUTH_SECRET, so it must not need it.
    await createOwner(createOwnerAuth(t.db), input);
    const res = await auth.api.signInEmail({ body: { email: input.email, password: input.password } });
    expect(res.user.email).toBe("owner@example.com");
  });
});

describe("parseOwnerDatabaseUrl", () => {
  it("accepts a Postgres URL", () => {
    expect(parseOwnerDatabaseUrl({ DATABASE_URL: "postgres://u:p@db.example.com/neondb?sslmode=require" })).toBe(
      "postgres://u:p@db.example.com/neondb?sslmode=require",
    );
  });

  it("prefers the unpooled URL when present", () => {
    expect(
      parseOwnerDatabaseUrl({
        DATABASE_URL: "postgres://u:p@pooled.example.com/db",
        DATABASE_URL_UNPOOLED: "postgres://u:p@direct.example.com/db",
      }),
    ).toBe("postgres://u:p@direct.example.com/db");
  });

  it.each([{}, { DATABASE_URL: "" }, { DATABASE_URL: "[SENSITIVE]" }, { DATABASE_URL: "not a url" }])(
    "explains a missing or placeholder database URL without echoing it (%j)",
    (env) => {
      expect(() => parseOwnerDatabaseUrl(env)).toThrow(/DATABASE_URL/);
      expect(() => parseOwnerDatabaseUrl(env)).not.toThrow(/SENSITIVE|not a url/);
    },
  );
});
