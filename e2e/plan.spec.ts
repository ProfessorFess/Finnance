import { expect, test } from "@playwright/test";
import { PLAN_EDIT_USER, PLAN_SCRATCH_USER, PLAN_TWO_USER, PLAN_USER, signIn } from "./fixtures";

test("creates the paycheck plan and shows the buckets", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/plan");
  await signIn(page, PLAN_USER);
  await page.getByRole("button", { name: /Paycheck plan/ }).click();
  await page.getByLabel("Savings & investing amount").fill("400");
  await page.getByLabel("Savings & investing move to").selectOption({ label: "Ally Savings" });
  await page.getByLabel("Weekly spending limit", { exact: true }).fill("200");
  await expect(page.getByLabel("Weekly spending amount")).toHaveValue("400.00");
  await page.getByLabel("Weekly spending move to").selectOption({ label: "Ally Spending" });
  await page.getByRole("button", { name: "Create plan" }).click();
  for (const name of ["Savings & investing", "Bills", "Weekly spending", "Goal fund / buffer"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Fully allocated")).toBeVisible();
});

test("starts from scratch with a monthly plan", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/plan");
  await signIn(page, PLAN_SCRATCH_USER);
  await page.getByRole("button", { name: /Start from scratch/ }).click();
  await page.getByLabel("Budget each month").check();
  await page.getByLabel("Side gigs").check();
  await page.getByRole("button", { name: "Add bucket" }).click();
  await page.getByLabel("New bucket name").fill("Groceries");
  await page.getByLabel("Groceries amount").fill("300");
  await page.getByLabel("Groceries limit", { exact: true }).fill("300");
  await page.getByLabel("Groceries limit period").selectOption({ label: "per month" });
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("heading", { name: "Groceries", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Whatever's left", exact: true })).toBeVisible();
  await expect(page.getByText("Fully allocated")).toBeVisible();
  await expect(page.getByText(/for a typical ≈ \$500\.00 month/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Income" }).getByText(/paycheck/i)).toHaveCount(0);
});

test("edits a bucket and sees the health check change", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/plan");
  await signIn(page, PLAN_EDIT_USER);
  await expect(page.getByText("Fully allocated")).toBeVisible();
  await page.getByRole("button", { name: "Edit plan" }).click();
  await page.getByRole("button", { name: "Edit Weekly spending" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount", { exact: true }).fill("900");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Over by/)).toBeVisible();
});

test("logs income for any of the plan's incomes", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/plan");
  await signIn(page, PLAN_TWO_USER);
  await page.getByRole("button", { name: "Log income" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Income", { exact: true }).selectOption({ label: "Tips" });
  await dialog.getByLabel("Amount").fill("40");
  await dialog.getByLabel("Date").fill("2026-11-12");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await page.goto("/recurring");
  await expect(page.getByRole("listitem").filter({ hasText: "Tips" }).getByText("Last Nov 12, 2026")).toBeVisible();
});
