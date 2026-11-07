import { expect, test } from "@playwright/test";
import { editorFixture } from "../editors/fixture.ts";
import { openEditor } from "./editor-session.ts";
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

test("retains editor values, sorting and selection while translating errors and metadata", async ({
  page,
}) => {
  const bytes = editorFixture();
  for (const [index, value] of [2, 10, 3].entries()) bytes[0x97 + 0x62c + index * 50 + 2] = value;
  await openEditor(page, "Locale draft retention", bytes);
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await page.getByLabel("Visible columns").press("Space");
  await page.getByRole("option", { name: "Abilities · Leadership", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("columnheader", { name: /Abilities · Leadership/ }).click();
  const rows = page.locator(".record-table tbody tr");
  const originalOrder = await rows.evaluateAll((elements) =>
    elements.map((row) => row.firstElementChild?.textContent),
  );
  await rows.first().click();
  await page.getByLabel("Leadership", { exact: true }).fill("17");
  await page.getByLabel("Leadership", { exact: true }).press("Tab");
  await page.getByRole("combobox", { name: "Language" }).selectOption("zh-CN");
  await expect(page.getByLabel(chinese("koukai2.leadership"), { exact: true })).toHaveValue("17");
  expect(
    await rows.evaluateAll((elements) => elements.map((row) => row.firstElementChild?.textContent)),
  ).toEqual(originalOrder);
  await expect(
    page.getByRole("button", { name: chinese("editor.save"), exact: true }),
  ).toBeEnabled();
  await page.getByLabel(chinese("koukai2.leadership"), { exact: true }).fill("-");
  await page.getByLabel(chinese("koukai2.leadership"), { exact: true }).press("Tab");
  await expect(page.getByText(chinese("controls.enterNumber"), { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: chinese("app.language") }).selectOption("en");
  await expect(page.getByLabel("Leadership", { exact: true })).toHaveValue("-");
  await expect(page.getByText("Enter a number.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save edits", exact: true })).toBeDisabled();
  await page.getByLabel("Leadership", { exact: true }).fill("17");
  await page.getByLabel("Leadership", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Edits were saved as a new revision");
});
