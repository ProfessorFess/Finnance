// Environment for the e2e server and setup. Test-only values.
// E2E_DATABASE_URL is guarded (assertSafeE2EDatabase) because setup truncates tables.
export const E2E_ENV = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://finnance:finnance@localhost:5432/finnance_test",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-only-secret-not-for-production-use-0001",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3100",
  ALLOW_SIGNUP: "false",
};
