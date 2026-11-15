import { expect, test } from "@playwright/test";
import { signIn, TXN_USER } from "./fixtures";

test.describe.configure({ mode: "serial" });

test("searches, categorizes in bulk, and sees history", async ({ page, isMobile }) => {
  test.skip(isMobile);
  await page.goto("/sign-in?next=/transactions");
  await signIn(page, TXN_USER);
  await expect(page.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
  await expect(page.getByText("Payroll Acme Corp")).toBeVisible();
  await expect(page.getByText("+$1,200.00")).toBeVisible();

  await page.getByRole("searchbox", { name: "Search transactions" }).fill("bennu");
  await expect(page).toHaveURL(/q=bennu/);
  await expect(page.getByRole("listitem").filter({ hasText: "Bennu Coffee" })).toHaveCount(2);
  await expect(page.getByText("Payroll Acme Corp")).toBeHidden();

  await page.getByRole("checkbox", { name: "Select all" }).check();
  const bulk = page.getByRole("region", { name: "Bulk actions" });
  await bulk.getByLabel("Category").selectOption({ label: "Coffee" });
  await bulk.getByRole("button", { name: "Apply to 2" }).click();
  const rows = page.getByRole("listitem").filter({ hasText: "Bennu Coffee" });
  await expect(rows.getByRole("button", { name: /Category: Coffee/ })).toHaveCount(2);

  await rows.first().getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("dialog").getByText("Category changed")).toBeVisible();
});

test("categorizes one transaction inline", async ({ page, isMobile }) => {
  test.skip(isMobile);
  await page.goto("/sign-in?next=/transactions");
  await signIn(page, TXN_USER);
  const row = page.getByRole("listitem").filter({ hasText: "Payroll Acme Corp" });
  await row.getByRole("button", { name: /Category: Uncategorized/ }).click();
  await page.getByRole("menuitem", { name: "Paycheck" }).click();
  await expect(row.getByRole("button", { name: /Category: Paycheck/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Payroll Acme Corp" }).getByRole("button", { name: /Category: Paycheck/ })).toBeVisible();
});

test("hides a duplicate and can bring it back", async ({ page, isMobile }) => {
  test.skip(isMobile);
  await page.goto("/sign-in?next=/transactions");
  await signIn(page, TXN_USER);
  const row = page.getByRole("listitem").filter({ hasText: "Withdrawal Internet Banking" });
  await row.getByRole("button", { name: "Details" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Hide as duplicate" }).click();
  await expect(row).toHaveCount(0);

  await page.getByRole("checkbox", { name: "Show hidden" }).check();
  await expect(page).toHaveURL(/hidden=1/);
  const hiddenRow = page.getByRole("listitem").filter({ hasText: "Withdrawal Internet Banking" });
  await expect(hiddenRow.getByText("Hidden", { exact: true })).toBeVisible();
  await hiddenRow.getByRole("button", { name: "Details" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Unhide" }).click();
  await expect(hiddenRow.getByText("Hidden", { exact: true })).toHaveCount(0);
});

test("adds a cash transaction by hand", async ({ page, isMobile }) => {
  test.skip(isMobile);
  await page.goto("/sign-in?next=/transactions");
  await signIn(page, TXN_USER);
  await page.getByRole("button", { name: "Add transaction" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Description").fill("Farmers market");
  await d.getByLabel("Amount").fill("18");
  await d.getByLabel("Date").fill("2026-11-14");
  await d.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Farmers market" }).getByText("-$18.00")).toBeVisible();
});

test("is usable on a phone without sideways scrolling", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.goto("/sign-in?next=/transactions");
  await signIn(page, TXN_USER);
  await expect(page.getByText("Payroll Acme Corp")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
