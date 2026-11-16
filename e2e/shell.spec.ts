import { expect, test } from "@playwright/test";
import { OWNER, OWNER_STATE, signIn } from "./fixtures";

test.use({ storageState: OWNER_STATE });
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

const desktopLinks = ["Home", "Transactions", "Plan", "Goals", "Recurring", "Accounts", "Import", "Settings"];
const placeholders: [string, string, RegExp][] = [
  ["/", "Home", /Phase 2a/],
];

test("desktop shows the sidebar and hides bottom tabs", async ({ page, isMobile }) => {
  test.skip(isMobile);
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const l of desktopLinks) await expect(nav.getByRole("link", { name: l })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Tabs" })).toBeHidden();
});

test("mobile shows bottom tabs and a More sheet", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  const tabs = page.getByRole("navigation", { name: "Tabs" });
  for (const l of ["Home", "Transactions", "Plan"]) await expect(tabs.getByRole("link", { name: l })).toBeVisible();
  await expect(tabs.getByRole("button", { name: "Assistant" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await tabs.getByRole("button", { name: "More" }).click();
  for (const l of ["Goals", "Recurring", "Accounts", "Import", "Settings"]) {
    await expect(page.getByRole("dialog").getByRole("link", { name: l })).toBeVisible();
  }
  await expect(page.getByRole("dialog").getByRole("button", { name: "Sign out" })).toBeVisible();
});

for (const [path, heading, phase] of placeholders) {
  test(`placeholder ${path} explains what's coming`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText(phase)).toBeVisible();
  });
}

test("assistant button opens the assistant sheet", async ({ page }) => {
  await page.getByRole("button", { name: "Assistant" }).first().click();
  await expect(page.getByRole("dialog").getByText("The assistant arrives in Phase 2b.")).toBeVisible();
});

test("has no horizontal scroll at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const [path] of placeholders) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, path).toBe(false);
  }
});

test("theme toggle switches to dark and persists", async ({ page, isMobile }) => {
  if (isMobile) await page.getByRole("navigation", { name: "Tabs" }).getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Toggle theme" }).first().click();
  await page.getByRole("menuitem", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("sends security headers", async ({ request }) => {
  const res = await request.get("/sign-in");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("serves an installable manifest", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m).toMatchObject({ name: "Finnance", short_name: "Finnance", display: "standalone", start_url: "/" });
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
});

test.describe("sign out", () => {
  // Fresh session: signing out revokes it, so it must not be the shared storage state.
  test.use({ storageState: { cookies: [], origins: [] } });
  test("returns to sign-in", async ({ page, isMobile }) => {
    await page.goto("/sign-in");
    await signIn(page, OWNER);
    await expect(page).toHaveURL("http://localhost:3100/");
    if (isMobile) await page.getByRole("navigation", { name: "Tabs" }).getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
