import { expect, test } from "@playwright/test";
import { chinese } from "./locales.ts";

test("presents both site names on separate lines in the home link", async ({ page }) => {
  await page.goto("/");
  const chineseName = chinese("app.chineseName");
  const brand = page
    .getByRole("banner")
    .getByRole("link", { name: `Rebito ${chineseName}`, exact: true });
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const english = brand.getByText("Rebito", { exact: true });
    const chineseLabel = brand.getByText(chineseName, { exact: true });
    await expect(brand).toBeVisible();
    const upper = await english.boundingBox();
    const lower = await chineseLabel.boundingBox();
    if (!upper || !lower) throw new Error("Missing site name");
    expect(upper.y + upper.height).toBeLessThanOrEqual(lower.y);
    expect(await chineseLabel.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      await english.evaluate((el) => getComputedStyle(el).fontSize),
    );
  }
});

test("registers, retains a session, reports a bad password and logs out", async ({
  page,
}, info) => {
  const email = `browser-${Date.now()}@example.test`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to your library" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("login.png") });
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Name").fill("Browser tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("browser-test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.locator(".account-actions")).toContainText("Browser tester");
  await page.reload();
  await expect(page.locator(".account-actions")).toContainText("Browser tester");
  await page.locator(".user-menu summary").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("incorrect-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your email or password is incorrect");
  await page.getByLabel("Password").fill("browser-test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".account-actions")).toContainText("Browser tester");
});

test("keeps the login controls usable at a narrow viewport", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Email")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("login-mobile.png") });
});
