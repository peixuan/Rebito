import { expect, test } from "@playwright/test";
import { coverPng } from "../../src/library/cover-image.ts";
import { useSession } from "./session.ts";

test("publishes and removes a version cover from game management", async ({ page }) => {
  await useSession(page.context(), "admin-console-nes");
  await page.goto("/");
  await page.getByRole("button", { name: "Game management" }).click();
  await page.getByLabel("Search published games").fill("NES runtime test");
  const title = page.getByText("NES runtime test", { exact: true });
  const row = page.getByRole("row").filter({ has: title });
  await row.getByRole("button", { name: "Edit configuration" }).click();
  const cover = page.getByRole("group", { name: "Cover", exact: true });
  const bytes = coverPng({
    width: 2,
    height: 1,
    rgba: Buffer.from([20, 80, 140, 255, 178, 165, 146, 255]).toString("base64"),
  });
  await cover
    .getByLabel("Choose a cover")
    .setInputFiles({ name: "landscape.png", mimeType: "image/png", buffer: bytes });
  await expect(cover.locator("img")).toBeVisible();
  await cover.getByRole("button", { name: "Save cover" }).click();
  await expect(row.locator("img")).toBeVisible();
  const url = await row.locator("img").evaluate((img: HTMLImageElement) => img.src);
  let resume = () => {};
  const transfer = new Promise<void>((resolve) => {
    resume = resolve;
  });
  await page.route(url, async (route) => {
    await transfer;
    await route.continue();
  });
  const card = page.getByRole("button").filter({ has: title });
  const artwork = card.locator(".game-cover");
  const platform = card.getByText("FC", { exact: true });
  try {
    await page.getByRole("button", { name: "Back to library" }).click();
    await page.getByLabel("Search games").fill("NES runtime test");
    await expect(artwork.locator("svg")).toBeVisible();
    await expect(platform).toBeVisible();
  } finally {
    resume();
  }
  const picture = card.locator("img");
  await expect
    .poll(() =>
      picture.evaluate((node: HTMLImageElement) => [node.naturalWidth, node.naturalHeight]),
    )
    .toEqual([2, 1]);
  await expect(artwork.locator("svg")).toHaveCount(0);
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const frame = await artwork.boundingBox();
    const badge = await platform.boundingBox();
    if (!frame || !badge) throw new Error("Missing cover or platform");
    const top = badge.y - frame.y;
    const right = frame.x + frame.width - (badge.x + badge.width);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(frame.height / 4);
    expect(right).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThan(frame.width / 4);
  }
  await page.getByRole("button", { name: "Game management" }).click();
  await page.getByLabel("Search published games").fill("NES runtime test");
  await row.getByRole("button", { name: "Edit configuration" }).click();
  await cover.getByRole("button", { name: "Remove cover" }).click();
  await cover.getByRole("button", { name: "Save cover" }).click();
  await expect(row.locator("img")).toHaveCount(0);
});
