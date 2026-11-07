import { expect, test } from "@playwright/test";
import { chinese } from "./locales.ts";

test("follows browser language, retains form inputs and errors, and remembers an override", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "zh-TW" });
  const page = await context.newPage();
  try {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://localhost:4317");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("heading")).toHaveText(chinese("account.loginTitle"));
    await page.getByLabel(chinese("account.email")).fill("absent@example.test");
    await page.getByLabel(chinese("account.password")).fill("incorrect-test-password");
    await page.getByRole("button", { name: chinese("account.login"), exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(chinese("errors.authentication"));
    await page.getByRole("combobox", { name: chinese("app.language") }).selectOption("en");
    await expect(page.getByLabel("Email")).toHaveValue("absent@example.test");
    await expect(page.getByLabel("Password")).toHaveValue("incorrect-test-password");
    await expect(page.getByRole("alert")).toContainText("Your email or password is incorrect");
    await expect(page).toHaveTitle("Rebito");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading")).toHaveText("Sign in to your library");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("switches language when preference storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Language" }).selectOption("zh-CN");
  await expect(page.getByRole("heading")).toHaveText(chinese("account.loginTitle"));
  await page.getByRole("combobox", { name: chinese("app.language") }).selectOption("en");
  await expect(page.getByRole("heading")).toHaveText("Sign in to your library");
});
