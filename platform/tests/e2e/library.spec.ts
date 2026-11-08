import { expect, test } from "@playwright/test";
import { useSession } from "./session.ts";

test("creates personal progress, imports bytes, restores history and isolates accounts", async ({
  page,
  browser,
}, info) => {
  await useSession(page.context(), "library");
  await page.goto("/");
  await expect(page.getByRole("meter", { name: "Personal profiles" })).toHaveAttribute(
    "value",
    "0",
  );
  await page.getByLabel("Search games").fill("Nonexistent game");
  await expect(page.getByText("No matching games.")).toBeVisible();
  await page.getByLabel("Search games").fill("");
  await page.getByRole("button", { name: /Test game/ }).click();
  await page.getByLabel("Profile name").fill("My first playthrough");
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("meter", { name: "Personal profiles" })).toHaveAttribute(
    "value",
    "1",
  );
  await page.getByRole("button", { name: "Open profile" }).click();
  await page.getByLabel("Save files").setInputFiles({
    name: "save.srm",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 255, 1]),
  });
  await page.getByRole("button", { name: "Upload save" }).click();
  await expect(page.getByRole("status")).toContainText("The save was stored");
  await expect(page.getByRole("meter", { name: "Save storage" })).toHaveAttribute("value", "3");
  await expect(page.getByRole("meter", { name: "Revision history" })).toHaveAttribute("value", "1");
  await page.getByLabel("Save files").setInputFiles({
    name: "save.srm",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([4, 5, 6]),
  });
  await page.getByRole("button", { name: "Upload save" }).click();
  await expect(page.getByRole("link", { name: "save.srm" })).toHaveCount(2);
  await page.getByRole("button", { name: "Restore this revision" }).click();
  await expect(page.getByRole("status")).toContainText("Restored");
  await expect(page.getByRole("meter", { name: "Save storage" })).toHaveAttribute("value", "9");
  await expect(page.getByRole("meter", { name: "Revision history" })).toHaveAttribute("value", "3");
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
    await useSession(second, "other");
    const other = await second.newPage();
    await other.goto("/");
    await expect(other.getByRole("meter", { name: "Save storage" })).toHaveAttribute("value", "0");
    await other.getByRole("button", { name: /Test game/ }).click();
    await expect(other.getByText("My first playthrough")).toHaveCount(0);
    expect((await second.request.get(path)).status()).toBe(404);
  } finally {
    await second.close();
  }
});
