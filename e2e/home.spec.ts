import { expect, test } from "@playwright/test";
import { HOME_USER, NOSTART_USER, signIn } from "./fixtures";

const OWNER_ORDER = ["Weekly spending", "Paycheck tasks", "Plan", "Goals", "Upcoming", "Spending by category", "Needs attention", "Recent transactions"];

test("shows the owner's Home", async ({ page, isMobile }) => {
  test.skip(isMobile, "layout order is checked on desktop");
  await page.goto("/sign-in?next=/");
  await signIn(page, HOME_USER);
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  const grid = page.getByTestId("home-grid");
  for (const name of OWNER_ORDER) await expect(grid.getByRole("region", { name, exact: true })).toBeVisible();
  const labels = await grid.locator(":scope > section").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(labels.filter((l) => l !== "Finish setting up")).toEqual(OWNER_ORDER);
  await expect(grid.getByText("left this week")).toBeVisible();
  await expect(grid.getByRole("region", { name: "Goals" }).getByText("Emergency fund")).toBeVisible();
});

test("is not blank for a new user", async ({ page, isMobile }) => {
  test.skip(isMobile, "checked on desktop");
  await page.goto("/sign-in?next=/");
  await signIn(page, NOSTART_USER);
  await page.waitForURL((u) => u.pathname === "/");
  const setup = page.getByRole("region", { name: "Finish setting up" });
  await expect(setup).toBeVisible();
  await expect(setup.getByRole("link", { name: /Choose your start date/ })).toBeVisible();
});
