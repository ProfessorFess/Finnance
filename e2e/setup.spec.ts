import { expect, test } from "@playwright/test";
import { SETUP_USER, signIn } from "./fixtures";

test("walks a new user through setup", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/setup");
  await signIn(page, SETUP_USER);
  await page.waitForURL((u) => u.pathname === "/setup");
  await expect(page.getByText("Step 1 of 6")).toBeVisible();
  await page.getByLabel("Tracking start date").fill("2026-11-07");
  await page.getByRole("button", { name: "Save start date" }).click();
  await page.getByRole("link", { name: "Next" }).click();

  await expect(page.getByText("Step 2 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Add account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Checking");
  await dialog.getByLabel(/Balance on/).fill("100");
  await dialog.getByRole("button", { name: /Save|Add/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("region", { name: "Add your accounts" }).getByText("Checking", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Next" }).click();

  await expect(page.getByText("Step 3 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByText("Step 4 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();

  await expect(page.getByText("Step 5 of 6")).toBeVisible();
  await page.getByRole("checkbox", { name: "Netflix" }).check();
  await page.getByRole("button", { name: "Add selected" }).click();
  await expect(page.getByText("Added 1 subscription")).toBeVisible();
  await page.getByRole("link", { name: "Next" }).click();

  await expect(page.getByText("Step 6 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByText("You're all set")).toBeVisible();
  await page.getByRole("link", { name: "Go to Home" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Finish setting up" })).toHaveCount(0);
});
