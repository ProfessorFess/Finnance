import { describe, expect, it } from "vitest";
import { shouldMigrate } from "./should-migrate";

describe("shouldMigrate", () => {
  it("migrates production builds", () => {
    expect(shouldMigrate({ VERCEL_ENV: "production" }).migrate).toBe(true);
  });

  it("refuses to migrate preview builds by default (could be the production database)", () => {
    const res = shouldMigrate({ VERCEL_ENV: "preview" });
    expect(res.migrate).toBe(false);
    expect(res.reason).toMatch(/MIGRATE_PREVIEWS/);
  });

  it("migrates previews only when explicitly enabled with exactly 'true'", () => {
    expect(shouldMigrate({ VERCEL_ENV: "preview", MIGRATE_PREVIEWS: "true" }).migrate).toBe(true);
    expect(shouldMigrate({ VERCEL_ENV: "preview", MIGRATE_PREVIEWS: "1" }).migrate).toBe(false);
  });

  it("does not migrate outside Vercel builds", () => {
    expect(shouldMigrate({}).migrate).toBe(false);
    expect(shouldMigrate({ VERCEL_ENV: "development" }).migrate).toBe(false);
  });
});
