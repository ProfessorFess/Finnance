import { expect, test } from "@playwright/test";
import { GOALS_ARCHIVE_USER, GOALS_LINK_USER, GOALS_ORDER_USER, GOALS_USER, signIn } from "./fixtures";

test("adds a goal and money by hand", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/goals");
  await signIn(page, GOALS_USER);
  await page.getByRole("button", { name: "Add goal" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Emergency fund");
  await dialog.getByLabel("Target", { exact: true }).fill("10000");
  await dialog.getByLabel("Already saved").fill("2500");
  await dialog.getByLabel("Plan to add").fill("800");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  const card = page.getByRole("listitem").filter({ hasText: "Emergency fund" });
  await expect(card.getByText("$2,500.00 of $10,000.00")).toBeVisible();
  await expect(card.getByText(/your plan/)).toBeVisible();
  await card.getByRole("button", { name: "Add money" }).click();
  const money = page.getByRole("dialog");
  await money.getByLabel("Amount").fill("100");
  await money.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("$2,600.00 of $10,000.00")).toBeVisible();
});

test("orders goals", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/goals");
  await signIn(page, GOALS_ORDER_USER);
  for (const name of ["First", "Second"]) {
    await page.getByRole("button", { name: "Add goal" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
  }
  await page.getByRole("button", { name: "Move Second up" }).click();
  await expect(page.getByRole("list", { name: "Goals" }).getByRole("heading").first()).toHaveText("Second");
});

test("counts a transaction toward a goal", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/transactions");
  await signIn(page, GOALS_LINK_USER);
  await page.getByRole("listitem").filter({ hasText: "Bennu Coffee" }).first().getByRole("button", { name: "Details" }).click();
  await page.getByRole("dialog").getByLabel("Counts toward").selectOption({ label: "Gift fund" });
  await expect(page.getByRole("dialog").getByLabel("Counts toward")).toHaveValue(/.+/);
  await page.goto("/goals");
  await expect(page.getByRole("listitem").filter({ hasText: "Gift fund" }).getByText("$6.25")).toBeVisible();
});

test("archives a goal and brings it back", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/goals");
  await signIn(page, GOALS_ARCHIVE_USER);
  const goalsList = page.getByRole("list", { name: "Goals" });
  await goalsList.getByRole("listitem").filter({ hasText: "Old trip" }).getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByLabel("Status").selectOption({ label: "Archived" });
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(goalsList).toHaveCount(0);
  const archived = page.getByRole("region", { name: "Archived goals" });
  await archived.getByText("Archived (1)").click();
  await archived.getByRole("listitem").filter({ hasText: "Old trip" }).getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByLabel("Status").selectOption({ label: "Active" });
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("list", { name: "Goals" }).getByRole("heading", { name: "Old trip" })).toBeVisible();
});
