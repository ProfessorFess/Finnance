import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as OTPAuth from "otpauth";
import { createTestDb } from "@/test/db";
import { signInForCookie } from "@/test/auth-helpers";
import { createAuth, type Auth } from "./auth";
import { createOwner } from "./create-owner";

const email = "owner@example.com";
const password = "a-long-test-password";
let t: Awaited<ReturnType<typeof createTestDb>>;
let auth: Auth;

beforeEach(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { baseURL: "http://localhost:3000", secret: "s".repeat(32), allowSignup: false });
  await createOwner(auth, { name: "Owner", email, password });
});
afterEach(async () => {
  await t.close();
});

async function enable2fa() {
  const { cookie } = await signInForCookie(auth, email, password);
  const headers = new Headers({ cookie });
  const enabled = await auth.api.enableTwoFactor({ body: { password }, headers });
  if (enabled.method !== "totp") throw new Error(`expected TOTP setup, got ${enabled.method}`);
  const { totpURI, backupCodes } = enabled;
  const totp = OTPAuth.URI.parse(totpURI) as OTPAuth.TOTP;
  await auth.api.verifyTOTP({ body: { code: totp.generate() }, headers });
  return { totp, backupCodes };
}

describe("two-factor", () => {
  it("enabling returns a TOTP URI and 10 backup codes, then sign-in requires a code", async () => {
    const { backupCodes } = await enable2fa();
    expect(backupCodes).toHaveLength(10);
    expect((await signInForCookie(auth, email, password)).twoFactorRedirect).toBe(true);
  });

  it("a correct TOTP code completes sign-in and a wrong one fails", async () => {
    const { totp } = await enable2fa();
    const { cookie } = await signInForCookie(auth, email, password);
    const headers = new Headers({ cookie });
    await expect(auth.api.verifyTOTP({ body: { code: "000000" }, headers })).rejects.toThrow();
    const ok = await auth.api.verifyTOTP({ body: { code: totp.generate() }, headers });
    expect(ok.user.email).toBe(email);
  });

  it("backup code completes sign-in once", async () => {
    const { backupCodes } = await enable2fa();
    const first = new Headers({ cookie: (await signInForCookie(auth, email, password)).cookie });
    await expect(auth.api.verifyBackupCode({ body: { code: backupCodes[0]! }, headers: first })).resolves.toBeTruthy();
    const second = new Headers({ cookie: (await signInForCookie(auth, email, password)).cookie });
    await expect(auth.api.verifyBackupCode({ body: { code: backupCodes[0]! }, headers: second })).rejects.toThrow();
  });

  it("disabling with the password returns to single-step sign-in", async () => {
    const { totp } = await enable2fa();
    const pending = new Headers({ cookie: (await signInForCookie(auth, email, password)).cookie });
    const session = await auth.api.verifyTOTP({
      body: { code: totp.generate() },
      headers: pending,
      returnHeaders: true,
    });
    const cookie = session.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    await auth.api.disableTwoFactor({ body: { password }, headers: new Headers({ cookie }) });
    expect((await signInForCookie(auth, email, password)).twoFactorRedirect).toBe(false);
  });
});
