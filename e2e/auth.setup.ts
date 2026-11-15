import { expect, test as setup } from "@playwright/test";
import { OWNER, OWNER_STATE, signIn } from "./fixtures";

setup("sign in as owner", async ({ page }) => {
  await page.goto("/sign-in");
  await signIn(page, OWNER);
  await expect(page).toHaveURL("http://localhost:3100/");
  await page.context().storageState({ path: OWNER_STATE });
});
