import { expect, it } from "vitest";
import { assertSafeE2EDatabase } from "./e2e-db-guard";

it("allows local databases and *_test databases", () => {
  expect(() => assertSafeE2EDatabase("postgres://u:p@localhost:5432/finnance_test")).not.toThrow();
  expect(() => assertSafeE2EDatabase("postgres://u:p@127.0.0.1:5432/finnance")).not.toThrow();
  expect(() => assertSafeE2EDatabase("postgres://u:p@db.example.com/app_test")).not.toThrow();
});

it("refuses a remote non-test database without echoing the URL", () => {
  const run = () => assertSafeE2EDatabase("postgres://u:secretpw@ep-x.neon.tech/neondb");
  expect(run).toThrow(/E2E_DATABASE_URL/);
  expect(run).not.toThrow(/secretpw/);
});
