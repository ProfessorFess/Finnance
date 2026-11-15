// Environment for the e2e server and setup. Test-only values; override via process.env.
export const E2E_ENV = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://finnance:finnance@localhost:5432/finnance_test",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-only-secret-not-for-production-use-0001",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3100",
  ALLOW_SIGNUP: "false",
};
