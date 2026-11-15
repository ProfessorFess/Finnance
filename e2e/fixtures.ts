import type { Page } from "@playwright/test";

// Test-only credentials, created fresh in the e2e database by global-setup.
export const OWNER = { name: "E2E Owner", email: "owner@e2e.test", password: "e2e-owner-password-123" };
export const TWOFA_USER = { name: "E2E TwoFA", email: "twofa@e2e.test", password: "e2e-twofa-password-123" };
export const ACCOUNTS_USER = { name: "E2E Accounts", email: "accounts@e2e.test", password: "e2e-accounts-password-1" };
export const IMPORT_USER = { name: "E2E Import", email: "import@e2e.test", password: "e2e-import-password-12" };
export const TXN_USER = { name: "E2E Txn", email: "txn@e2e.test", password: "e2e-txn-password-1234" };
export const NOSTART_USER = { name: "E2E NoStart", email: "nostart@e2e.test", password: "e2e-nostart-password-1" };
export const TRANSFER_USER = { name: "E2E Transfer", email: "transfer@e2e.test", password: "e2e-transfer-password-1" };
export const LEARN_USER = { name: "E2E Learn", email: "learn@e2e.test", password: "e2e-learn-password-123" };
export const REVIEW_USER = { name: "E2E Review", email: "review@e2e.test", password: "e2e-review-password-12" };
export const REVIEW_USER_M = { name: "E2E Review Mobile", email: "review-m@e2e.test", password: "e2e-review-m-password-1" };
export const RULES_USER = { name: "E2E Rules", email: "rules@e2e.test", password: "e2e-rules-password-123" };
export const OWNER_STATE = "e2e/.auth/owner.json";

const octet = () => Math.floor(Math.random() * 254) + 1;

/**
 * Fills and submits the sign-in form. Each call uses a random client IP so
 * sign-ins don't share the 5-per-minute rate-limit bucket (the e2e server is a
 * production build). On Vercel the real client IP overwrites this header.
 */
export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` });
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
