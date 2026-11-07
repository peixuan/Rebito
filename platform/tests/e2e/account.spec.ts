import { expect, test } from "@playwright/test";

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
  await expect(page.getByRole("heading", { name: "Welcome back, Browser tester" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back, Browser tester" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("incorrect-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your email or password is incorrect");
  await page.getByLabel("Password").fill("browser-test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back, Browser tester" })).toBeVisible();
});
