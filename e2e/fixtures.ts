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
export const SORT_USER = { name: "E2E Sort", email: "sort@e2e.test", password: "e2e-sort-password-1234" };
export const RULES_USER = { name: "E2E Rules", email: "rules@e2e.test", password: "e2e-rules-password-123" };
export const RECURRING_USER = { name: "E2E Recurring", email: "recurring@e2e.test", password: "e2e-recurring-password-1" };
export const RECURRING_TRACK_USER = { name: "E2E Recurring Track", email: "recurring-track@e2e.test", password: "e2e-recurring-track-pw-1" };
export const RECURRING_LOG_USER = { name: "E2E Recurring Log", email: "recurring-log@e2e.test", password: "e2e-recurring-log-pw-12" };
export const PLAN_USER = { name: "E2E Plan", email: "plan@e2e.test", password: "e2e-plan-password-1234" };
export const PLAN_SCRATCH_USER = { name: "E2E Plan Scratch", email: "plan-scratch@e2e.test", password: "e2e-plan-scratch-pw-12" };
export const PLAN_EDIT_USER = { name: "E2E Plan Edit", email: "plan-edit@e2e.test", password: "e2e-plan-edit-pw-1234" };
export const PLAN_TWO_USER = { name: "E2E Plan Two", email: "plan-two@e2e.test", password: "e2e-plan-two-pw-12345" };
export const GOALS_USER = { name: "E2E Goals", email: "goals@e2e.test", password: "e2e-goals-password-12" };
export const GOALS_ORDER_USER = { name: "E2E Goals Order", email: "goals-order@e2e.test", password: "e2e-goals-order-pw-12" };
export const GOALS_LINK_USER = { name: "E2E Goals Link", email: "goals-link@e2e.test", password: "e2e-goals-link-pw-123" };
export const GOALS_ARCHIVE_USER = { name: "E2E Goals Archive", email: "goals-archive@e2e.test", password: "e2e-goals-archive-pw-1" };
export const HOME_USER = { name: "E2E Home", email: "home@e2e.test", password: "e2e-home-password-1234" };
export const SETUP_USER = { name: "E2E Setup", email: "setup@e2e.test", password: "e2e-setup-password-123" };
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
