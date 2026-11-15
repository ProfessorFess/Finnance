import { expect, test } from "@playwright/test";
import { IMPORT_USER, NOSTART_USER, signIn } from "./fixtures";

const UFCU = "src/server/import/__fixtures__/ufcu-checking.csv";
const ALLY = "src/server/import/__fixtures__/ally-spending.csv";

test.describe.configure({ mode: "serial" });
test.beforeEach(({ isMobile }) => test.skip(isMobile, "stateful flow runs on desktop"));

test("imports UFCU and Ally files together, then skips duplicates on re-upload, then undoes", async ({ page }) => {
  await page.goto("/sign-in?next=/import");
  await signIn(page, IMPORT_USER);
  await page.getByLabel("Choose files").setInputFiles([UFCU, ALLY]);

  const ufcu = page.getByRole("article").filter({ hasText: "ufcu-checking.csv" });
  const ally = page.getByRole("article").filter({ hasText: "ally-spending.csv" });
  await expect(ufcu.getByText("UFCU export")).toBeVisible();
  await expect(ufcu.getByText("5 to import · 1 pending skipped · 1 before your start date")).toBeVisible();
  await expect(ufcu.getByLabel("Account")).toHaveValue(/.+/);
  await expect(ally.getByText("3 to import · 1 before your start date")).toBeVisible();
  await expect(ally.getByLabel("Account")).toHaveValue(/.+/);

  await page.getByRole("button", { name: "Import 2 files" }).click();
  await expect(ufcu.getByText("5 imported")).toBeVisible();
  await expect(ally.getByText("3 imported")).toBeVisible();

  await page.getByRole("button", { name: "Import more" }).click();
  await page.getByLabel("Choose files").setInputFiles([UFCU]);
  await expect(page.getByRole("article").filter({ hasText: "ufcu-checking.csv" }).getByText("UFCU export")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 file" }).click();
  await expect(page.getByText("0 imported · 5 already here")).toBeVisible();

  const recent = page.getByRole("region", { name: "Recent imports" });
  await recent.getByRole("listitem").filter({ hasText: "ally-spending.csv" }).getByRole("button", { name: "Undo" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Undo import" }).click();
  await expect(recent.getByRole("listitem").filter({ hasText: "ally-spending.csv" }).getByText("Undone")).toBeVisible();
});

test("imports an unrecognized layout with the guessed columns, and lets you change a saved layout", async ({ page }) => {
  await page.goto("/sign-in?next=/import");
  await signIn(page, IMPORT_USER);
  await page.getByLabel("Choose files").setInputFiles(["src/server/import/__fixtures__/generic-bad.csv"]);
  const card = page.getByRole("article").filter({ hasText: "generic-bad.csv" });
  await expect(card.getByText("Which column is which?")).toBeVisible();
  await expect(card.getByText("2 to import · 3 rows couldn't be read")).toBeVisible();
  await card.getByLabel("Account").selectOption({ label: "UFCU Checking" });
  await page.getByRole("button", { name: "Import 1 file" }).click();
  await expect(card.getByText("2 imported")).toBeVisible();

  await page.getByRole("button", { name: "Import more" }).click();
  await page.getByLabel("Choose files").setInputFiles(["src/server/import/__fixtures__/generic-bad.csv"]);
  const again = page.getByRole("article").filter({ hasText: "generic-bad.csv" });
  await expect(again.getByText("Saved format")).toBeVisible();
  await expect(again.getByText("Which column is which?")).toBeHidden();
  await again.getByRole("button", { name: "Change columns" }).click();
  await expect(again.getByText("Which column is which?")).toBeVisible();
});

test("sends you to set a start date first", async ({ page }) => {
  await page.goto("/sign-in?next=/import");
  await signIn(page, NOSTART_USER);
  await expect(page.getByText("Set your tracking start date first")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Accounts" })).toHaveAttribute("href", "/accounts");
});
