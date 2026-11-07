import { expect, test } from "@playwright/test";

test("creates personal progress, imports bytes, restores history and isolates accounts", async ({
  page,
  browser,
}, info) => {
  const suffix = Date.now();
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin: "http://localhost:4317" },
    data: {
      email: `library-${suffix}@example.test`,
      name: "Save test",
      password: "browser-test-password-123",
    },
  });
  expect(signup.ok()).toBe(true);
  await page.goto("/");
  await page.getByLabel("Search games").fill("Nonexistent game");
  await expect(page.getByText("No matching games.")).toBeVisible();
  await page.getByLabel("Search games").fill("");
  await page.getByRole("button", { name: /Test game/ }).click();
  await page.getByLabel("Profile name").fill("My first playthrough");
  await page.getByRole("button", { name: "Create profile" }).click();
  await page.getByRole("button", { name: "Open profile" }).click();
  await page.getByLabel("Save files").setInputFiles({
    name: "save.srm",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 255, 1]),
  });
  await page.getByRole("button", { name: "Upload save" }).click();
  await expect(page.getByRole("status")).toContainText("The save was stored");
  await page.getByLabel("Save files").setInputFiles({
    name: "save.srm",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([4, 5, 6]),
  });
  await page.getByRole("button", { name: "Upload save" }).click();
  await expect(page.getByRole("link", { name: "save.srm" })).toHaveCount(2);
  await page.getByRole("button", { name: "Restore this revision" }).click();
  await expect(page.getByRole("status")).toContainText("Restored");
  const path = await page.getByRole("link", { name: "save.srm" }).first().getAttribute("href");
  if (!path) throw new Error("Expected a private revision download");
  expect(await (await page.request.get(path)).body()).toEqual(Buffer.from([0, 255, 1]));
  await page.screenshot({ path: info.outputPath("history.png") });
  await page.reload();
  await page.getByRole("button", { name: /Test game/ }).click();
  await page.getByRole("button", { name: "Open profile" }).click();
  await expect(page.getByRole("link", { name: "save.srm" })).toHaveCount(3);

  const second = await browser.newContext({ baseURL: "http://localhost:4317" });
  try {
    await second.request.post("/api/auth/sign-up/email", {
      headers: { origin: "http://localhost:4317" },
      data: {
        email: `other-${suffix}@example.test`,
        name: "Another account",
        password: "browser-test-password-123",
      },
    });
    const other = await second.newPage();
    await other.goto("/");
    await other.getByRole("button", { name: /Test game/ }).click();
    await expect(other.getByText("My first playthrough")).toHaveCount(0);
    expect((await second.request.get(path)).status()).toBe(404);
  } finally {
    await second.close();
  }
});
