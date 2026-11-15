import { expect, test } from "@playwright/test";
import { RULES_USER, signIn } from "./fixtures";

test("adds and deletes a rule", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/settings");
  await signIn(page, RULES_USER);
  await page.getByRole("link", { name: /Categories & rules/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rules" })).toBeVisible();
  await expect(page.getByText('"starbucks"')).toBeVisible();
  await page.getByLabel("Merchant or text").fill("bennu");
  await page.getByLabel("Category").selectOption({ label: "Coffee" });
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText("Updated 2 transactions")).toBeVisible();
  await expect(page.getByText('"bennu"')).toBeVisible();
  await page.getByRole("button", { name: "Delete rule bennu" }).click();
  await expect(page.getByText('"bennu"')).toBeHidden();
});
