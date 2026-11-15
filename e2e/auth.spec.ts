import { expect, test } from "@playwright/test";
import { OWNER, signIn } from "./fixtures";

test("redirects an unauthenticated deep link to sign-in, then back", async ({ page }) => {
  await page.goto("/goals");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fgoals/);
  await signIn(page, OWNER);
  await expect(page).toHaveURL(/\/goals$/);
});

test("shows a generic error for a wrong password", async ({ page }) => {
  await page.goto("/sign-in");
  await signIn(page, { email: OWNER.email, password: "definitely-wrong-password" });
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("ignores an off-site next parameter", async ({ page }) => {
  await page.goto("/sign-in?next=https://evil.example");
  await signIn(page, OWNER);
  await expect(page).toHaveURL("http://localhost:3100/");
});
