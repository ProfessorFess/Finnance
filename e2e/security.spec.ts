import { expect, test } from "@playwright/test";
import * as OTPAuth from "otpauth";
import { TWOFA_USER, signIn } from "./fixtures";

test("owner enables 2FA, then sign-in requires a code", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs once");
  await page.goto("/sign-in?next=/settings/security");
  await signIn(page, TWOFA_USER);

  await page.getByRole("button", { name: "Enable two-factor authentication" }).click();
  await page.getByRole("dialog").getByLabel("Password", { exact: true }).fill(TWOFA_USER.password);
  await page.getByRole("button", { name: "Continue" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.replace(/\s/g, "");
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  await page.getByLabel("Authentication code").fill(totp.generate());
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByTestId("backup-codes").locator("li")).toHaveCount(10);
  await page.getByLabel("I've saved these codes").check();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Two-factor authentication is on")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await signIn(page, TWOFA_USER);
  await page.getByLabel("Authentication code").fill(totp.generate());
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL("http://localhost:3100/");
});
