import { expect, test } from "@playwright/test";
import { ACCOUNTS_USER, signIn } from "./fixtures";

test.describe.configure({ mode: "serial" });
test.beforeEach(({ isMobile }) => test.skip(isMobile, "stateful flow runs on desktop"));

test("sets the start date, adds an account, and shows its balance", async ({ page }) => {
  await page.goto("/sign-in?next=/accounts");
  await signIn(page, ACCOUNTS_USER);
  await expect(page.getByText("When does tracking start?")).toBeVisible();
  await page.getByLabel("Tracking start date").fill("2026-11-07");
  await page.getByRole("button", { name: "Save start date" }).click();
  await expect(page.getByText("Tracking since Nov 7, 2026")).toBeVisible();

  await page.getByRole("button", { name: "Add account" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("UFCU Checking");
  await dialog.getByLabel("Type").selectOption("checking");
  await dialog.getByLabel("Bank").fill("UFCU");
  await dialog.getByLabel("Balance on Nov 7, 2026").fill("1,520.34");
  await dialog.getByRole("button", { name: "Save account" }).click();

  const row = page.getByRole("listitem").filter({ hasText: "UFCU Checking" });
  await expect(row.getByText("$1,520.34")).toBeVisible();
});

test("rejects a bad balance with a clear message", async ({ page }) => {
  await page.goto("/sign-in?next=/accounts");
  await signIn(page, ACCOUNTS_USER);
  await page.getByRole("button", { name: "Add account" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Broken");
  await dialog.getByLabel("Balance on Nov 7, 2026").fill("lots");
  await dialog.getByRole("button", { name: "Save account" }).click();
  await expect(dialog.getByText("Enter the balance as a dollar amount, like 1,520.34")).toBeVisible();
});
