import { expect, test } from "@playwright/test";
import { REVIEW_USER, REVIEW_USER_M, signIn, SORT_USER } from "./fixtures";

test("works through the review queue", async ({ page, isMobile }) => {
  await page.goto("/sign-in?next=/transactions/review");
  await signIn(page, isMobile ? REVIEW_USER_M : REVIEW_USER);
  await expect(page.getByRole("heading", { level: 1, name: "Review" })).toBeVisible();
  const card = page.getByRole("article", { name: "Transaction to review" });
  await expect(card).toBeVisible();
  await expect(page.getByText(/1 of \d+/)).toBeVisible();
  const first = await card.locator("p").first().textContent();
  await card.getByRole("button", { name: "More categories" }).click();
  await page.getByRole("menuitem", { name: "Restaurants" }).click();
  await expect(card.locator("p").first()).not.toHaveText(first!);
  for (let i = 0; i < 10 && (await card.isVisible()); i++) await card.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText("All caught up")).toBeVisible();
  if (isMobile) expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("Sort now fills the deck with what still needs a look", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs on desktop");
  await page.goto("/sign-in?next=/transactions/review");
  await signIn(page, SORT_USER);
  await expect(page.getByText("3 transactions haven't been sorted yet.", { exact: false })).toBeVisible();
  await expect(page.getByText("All caught up")).toBeVisible();
  await page.getByRole("button", { name: "Sort now" }).click();
  // Starbucks is sorted by a built-in rule; the other two need a look (no AI key in e2e).
  await expect(page.getByRole("article", { name: "Transaction to review" })).toBeVisible();
  await expect(page.getByText(/1 of 2/)).toBeVisible();
});
