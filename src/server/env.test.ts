import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/finnance",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("parses a valid environment with signup closed by default", () => {
    const env = parseEnv(valid);
    expect(env.databaseUrl).toBe(valid.DATABASE_URL);
    expect(env.authBaseUrl).toBe("http://localhost:3000");
    expect(env.allowSignup).toBe(false);
    expect(env.anthropicApiKey).toBeUndefined();
  });

  it("throws naming every missing variable", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*BETTER_AUTH_SECRET/);
  });

  it("rejects a short auth secret without echoing it", () => {
    const run = () => parseEnv({ ...valid, BETTER_AUTH_SECRET: "tooshort-secret-value" });
    expect(run).toThrow(/BETTER_AUTH_SECRET/);
    expect(run).not.toThrow(/tooshort-secret-value/);
  });

  it("only opens signup for the exact string 'true'", () => {
    expect(parseEnv({ ...valid, ALLOW_SIGNUP: "true" }).allowSignup).toBe(true);
    for (const v of ["TRUE", "1", "yes", "false", ""]) {
      expect(parseEnv({ ...valid, ALLOW_SIGNUP: v }).allowSignup).toBe(false);
    }
  });

  it("derives the auth URL from VERCEL_URL when BETTER_AUTH_URL is unset", () => {
    const env = parseEnv({ ...valid, BETTER_AUTH_URL: undefined, VERCEL_URL: "finnance-abc.vercel.app" });
    expect(env.authBaseUrl).toBe("https://finnance-abc.vercel.app");
  });

  it("trusts the base URL and Vercel preview URLs as origins", () => {
    const env = parseEnv({
      ...valid,
      VERCEL_URL: "finnance-abc.vercel.app",
      VERCEL_BRANCH_URL: "finnance-git-x.vercel.app",
    });
    expect(env.trustedOrigins).toEqual(
      expect.arrayContaining([
        "http://localhost:3000",
        "https://finnance-abc.vercel.app",
        "https://finnance-git-x.vercel.app",
      ]),
    );
  });

  it("uses the production alias on Vercel production when BETTER_AUTH_URL is unset", () => {
    const env = parseEnv({
      ...valid,
      BETTER_AUTH_URL: undefined,
      VERCEL_ENV: "production",
      VERCEL_URL: "finnance-abc123.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "finnance.vercel.app",
    });
    expect(env.authBaseUrl).toBe("https://finnance.vercel.app");
    expect(env.trustedOrigins).toContain("https://finnance-abc123.vercel.app");
  });

  it("always trusts the production alias so sign-in works there", () => {
    const env = parseEnv({ ...valid, VERCEL_PROJECT_PRODUCTION_URL: "finnance.vercel.app" });
    expect(env.trustedOrigins).toContain("https://finnance.vercel.app");
  });

  it("requires BETTER_AUTH_URL when not on Vercel", () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_URL: undefined })).toThrow(/BETTER_AUTH_URL/);
  });
});
