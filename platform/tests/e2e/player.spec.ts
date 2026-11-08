import { expect, test } from "@playwright/test";
import { useSession } from "./session.ts";

test("plays DOS in the workspace and publishes bytes through the cloud revision API", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1043, height: 900 });
  await useSession(page.context(), "player");
  await page.goto("/");
  await page.getByRole("button", { name: /DOS save test/ }).click();
  await page.getByLabel("Profile name").fill("Real emulator");
  await page.getByRole("button", { name: "Create profile" }).click();
  await page.getByRole("button", { name: "Open profile" }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  const save = page.getByRole("button", { name: "Save to account" });
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await expect(page.frameLocator("iframe").locator("canvas")).toBeVisible();
  const runtime = page.frames().find((frame) => frame.url().endsWith("/runtime.html"));
  if (!runtime) throw new Error("Missing DOS frame");
  async function pixelRatio() {
    return runtime?.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
      const box = canvas.getBoundingClientRect();
      return (box.width * devicePixelRatio) / canvas.width;
    });
  }
  await expect.poll(pixelRatio).toBe(1);
  const pixels = page.getByRole("button", { name: "Integer scaling", exact: true });
  await pixels.click();
  await expect.poll(pixelRatio).toBeGreaterThan(1.4);
  await pixels.click();
  await expect.poll(pixelRatio).toBe(1);
  // At fractional enlargement, CSS smoothing must not add colors to VGA text.
  const rendered = await runtime.locator("canvas").screenshot();
  const channels = await page.evaluate(async (png) => {
    const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Missing screenshot decoder");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(2, 2, image.width - 4, image.height - 4).data;
    return [...new Set(pixels.filter((_, index) => index % 4 !== 3))];
  }, rendered.toString("base64"));
  expect(channels.length).toBeGreaterThan(1);
  expect(channels.every((value) => [0, 85, 170, 255].includes(value))).toBe(true);
  const mouseMode = page.getByRole("button", { name: "Relative mouse", exact: true });
  await mouseMode.click();
  await expect(mouseMode).toHaveAttribute("aria-pressed", "true");
  await expect.poll(pixelRatio).toBe(1);
  await runtime.locator("canvas").click();
  await expect.poll(() => runtime.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(() => runtime.evaluate(() => Boolean(document.pointerLockElement))).toBe(false);
  await mouseMode.click();
  await expect(mouseMode).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(async () => {
      await save.click();
      await expect(page.getByRole("status")).toContainText("saved to your account");
      return page.getByRole("link", { name: "SAVE.DAT", exact: true }).count();
    })
    .toBeGreaterThan(0);
  const first = await page
    .getByRole("link", { name: "SAVE.DAT", exact: true })
    .first()
    .getAttribute("href");
  if (!first) throw new Error("Missing cloud save link");
  expect(await (await page.request.get(first)).body()).toEqual(Buffer.from("FIRST\r\n"));
  await page.getByLabel("Save files").setInputFiles({
    name: "SAVE.DAT",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("SECOND\r\n"),
  });
  await page.getByRole("button", { name: "Upload save" }).click();
  await expect(
    page.getByRole("region", { name: "Game window", exact: true }).getByRole("alert"),
  ).toContainText("The local game is paused and retained");
  expect(runtime.isDetached()).toBe(false);
  await expect(save).toBeDisabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Discard local progress", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start game" })).toBeVisible();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(save).toBeEnabled();
  await page.getByRole("button", { name: "Pause game" }).click();
  await save.click();
  await expect(page.getByRole("button", { name: "Resume game" })).toBeEnabled();
  const latest = await page
    .getByRole("link", { name: "SAVE.DAT", exact: true })
    .first()
    .getAttribute("href");
  if (!latest) throw new Error("Missing replacement save link");
  expect(await (await page.request.get(latest)).body()).toEqual(Buffer.from("SECOND\r\n"));
  await page.screenshot({ path: info.outputPath("workspace.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Stop game" }).click();
  await expect(page.getByRole("button", { name: "Start game" })).toBeVisible();
});
