import { expect, test } from "@playwright/test";
import { PLAN_EDIT_USER, RECURRING_LOG_USER, RECURRING_TRACK_USER, RECURRING_USER, signIn } from "./fixtures";

test("adds a bill and sees it matched", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/recurring");
  await signIn(page, RECURRING_USER);
  await expect(page.getByRole("heading", { level: 1, name: "Recurring" })).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type", { exact: true }).selectOption({ label: "Subscription" });
  await dialog.getByLabel("Name").fill("Prime Video");
  await dialog.getByLabel("How often").selectOption({ label: "Monthly" });
  await dialog.getByLabel("First date").fill("2026-11-14");
  await dialog.getByLabel("Amount", { exact: true }).fill("21.64");
  await dialog.getByLabel("Match text").fill("Prime Video");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  const card = page.getByRole("listitem").filter({ hasText: "Prime Video" });
  await expect(card.getByText("Last Nov 14, 2026")).toBeVisible();
  await expect(card.getByText("$21.64").first()).toBeVisible();
  await expect(card.getByText(/Late/)).toHaveCount(0);
});

test("tracks the paycheck from a transaction, then un-matches it", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/transactions");
  await signIn(page, RECURRING_TRACK_USER);
  const payroll = page.getByRole("listitem").filter({ hasText: "Payroll Acme Corp" });
  await payroll.getByRole("button", { name: "Details" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Track as recurring" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Track something that repeats" });
  await expect(dialog.getByLabel("Name")).toHaveValue("Payroll Acme Corp");
  await expect(dialog.getByLabel("Type", { exact: true })).toHaveValue("income");
  await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("1200.00");
  await dialog.getByLabel("How often").selectOption({ label: "Every 2 weeks" });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  // The open sheet updates in place.
  await expect(sheet.getByText("Payroll Acme Corp · expected Nov 14, 2026")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(payroll.getByLabel("Recurring: Payroll Acme Corp")).toBeVisible();

  await page.goto("/recurring");
  const card = page.getByRole("listitem").filter({ hasText: "Payroll Acme Corp" });
  await expect(card.getByText("Last Nov 14, 2026")).toBeVisible();

  await page.goto("/transactions");
  await payroll.getByRole("button", { name: "Details" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Not this one" }).click();
  await expect(page.getByRole("dialog").getByLabel("Part of")).toBeVisible();
});

test("asks before deleting an item", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/recurring");
  await signIn(page, RECURRING_USER);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type", { exact: true }).selectOption({ label: "Subscription" });
  await dialog.getByLabel("Name").fill("Delete Me");
  await dialog.getByLabel("First date").fill("2026-11-14");
  await dialog.getByLabel("Amount", { exact: true }).fill("5.00");
  await dialog.getByLabel("Match text").fill("Delete Me");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  const card = page.getByRole("listitem").filter({ hasText: "Delete Me" });
  await card.getByRole("button").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByText("Delete Delete Me?")).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog").getByLabel("Name")).toHaveValue("Delete Me");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Delete Me" })).toHaveCount(0);
});

test("logs income by hand", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/recurring");
  await signIn(page, RECURRING_LOG_USER);
  await page.getByRole("button", { name: "Log income for Tips" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("85");
  await dialog.getByLabel("Date").fill("2026-11-12");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  const card = page.getByRole("listitem").filter({ hasText: "Tips" });
  await expect(card.getByText("Last Nov 12, 2026")).toBeVisible();
  await expect(card.getByText("$85.00").first()).toBeVisible();
});

test("chooses which bucket pays a bill", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/recurring");
  await signIn(page, PLAN_EDIT_USER);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type", { exact: true }).selectOption({ label: "Subscription" });
  await dialog.getByLabel("Name").fill("Spotify");
  await dialog.getByLabel("First date").fill("2026-11-14");
  await dialog.getByLabel("Amount", { exact: true }).fill("11.99");
  await dialog.getByLabel("Match text").fill("Spotify");
  await expect(dialog.getByLabel("Paid from")).toHaveValue(/.+/);
  await dialog.getByLabel("Paid from").selectOption({ label: "Weekly spending" });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("listitem").filter({ hasText: "Spotify" }).getByRole("button").first().click();
  await expect(page.getByRole("dialog").getByLabel("Paid from").locator("option:checked")).toHaveText("Weekly spending");
});
