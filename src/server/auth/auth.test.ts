import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { user } from "@/server/db/schema";
import { createAuth, type Auth } from "./auth";

const BASE = "http://localhost:3000";
const opts = { baseURL: BASE, secret: "s".repeat(32), trustedOrigins: [BASE] };
let t: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  t = await createTestDb();
});
afterEach(async () => {
  await t.close();
});

const post = (auth: Auth, path: string, body: unknown, ip = "203.0.113.5") =>
  auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );

const owner = { name: "Owner", email: "owner@example.com", password: "a-long-test-password" };

describe("createAuth", () => {
  it("rejects sign-up over HTTP when signup is closed", async () => {
    const auth = createAuth(t.db, { ...opts, allowSignup: false });
    const res = await post(auth, "/sign-up/email", owner);
    expect(res.ok).toBe(false);
    expect(await t.db.select().from(user)).toHaveLength(0);
  });

  it("allows sign-up when signup is open", async () => {
    const auth = createAuth(t.db, { ...opts, allowSignup: true });
    expect((await post(auth, "/sign-up/email", owner)).ok).toBe(true);
    expect(await t.db.select().from(user)).toHaveLength(1);
  });

  it("rejects passwords shorter than 12 characters", async () => {
    const auth = createAuth(t.db, { ...opts, allowSignup: true });
    expect((await post(auth, "/sign-up/email", { ...owner, password: "short-pass1" })).ok).toBe(false);
  });

  it("returns the same error for unknown email and wrong password", async () => {
    const auth = createAuth(t.db, { ...opts, allowSignup: true });
    await post(auth, "/sign-up/email", owner);
    const unknown = await post(auth, "/sign-in/email", { email: "nobody@example.com", password: owner.password });
    const wrong = await post(auth, "/sign-in/email", { email: owner.email, password: "wrong-password-123" });
    expect(unknown.status).toBe(wrong.status);
    expect((await unknown.json()).message).toBe((await wrong.json()).message);
  });

  it("rate-limits sign-in after 5 attempts per minute", async () => {
    const auth = createAuth(t.db, { ...opts, allowSignup: false, rateLimitEnabled: true });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (await post(auth, "/sign-in/email", { email: owner.email, password: "wrong-password-123" })).status,
      );
    }
    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses[5]).toBe(429);
  });
});
