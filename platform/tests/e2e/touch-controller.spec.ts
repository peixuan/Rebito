import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { useSession } from "./session.ts";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

async function start(page: Page, title: RegExp) {
  await useSession(page.context(), "touch");
  await page.goto("/");
  await page.getByRole("button", { name: title }).click();
  const name = `Touch ${randomUUID()}`;
  await page.getByLabel("Profile name").fill(name);
  await page.getByRole("button", { name: "Create profile" }).click();
  await page
    .locator(".profile-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Open profile" })
    .click();
  await page.getByRole("button", { name: "Start game" }).click();
}
test("plays a real NES with two thumbs and releases cancelled contacts", async ({ page }) => {
  test.setTimeout(60_000);
  await start(page, /\bNES runtime test/);
  const toggle = page.getByRole("button", { name: "Touch controller" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false", { timeout: 30_000 });
  await toggle.tap();
  const pad = page.getByRole("group", { name: "Touch controller" });
  await pad.scrollIntoViewIfNeeded();
  const up = pad.getByRole("button", { name: "Up", exact: true });
  const action = pad.getByRole("button", { name: "A", exact: true });
  async function point(button: Locator, id: number) {
    const box = await button.boundingBox();
    if (!box) throw new Error("Missing touch target");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
  }
  const cdp = await page.context().newCDPSession(page);
  const first = await point(up, 1),
    second = await point(action, 2);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first, second] });
  await expect(up).toHaveAttribute("data-held", "true");
  await expect(action).toHaveAttribute("data-held", "true");
  const runtime = page.frames().find((f) => f.url().endsWith("/runtime.html"));
  if (!runtime) throw new Error("Missing NES frame");
  await expect
    .poll(() =>
      runtime.evaluate(
        () =>
          new Promise<boolean>((resolve) =>
            requestAnimationFrame(() => {
              const canvas = document.querySelector("canvas");
              const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
              if (!canvas || !gl) throw new Error("Missing NES framebuffer");
              const rgb = new Uint8Array(4);
              gl.readPixels(
                canvas.width / 2,
                canvas.height / 2,
                1,
                1,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                rgb,
              );
              resolve((rgb[2] ?? 0) > (rgb[1] ?? 0));
            }),
          ),
      ),
    )
    .toBe(true);
  const right = pad.getByRole("button", { name: "Right", exact: true });
  const rightPoint = await point(right, 1);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...first, x: rightPoint.x }, second],
  });
  await expect(up).toHaveAttribute("data-held", "true");
  await expect(right).toHaveAttribute("data-held", "true");
  await expect(action).toHaveAttribute("data-held", "true");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect(pad.locator('[data-held="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Pause game" }).click();
  await expect(action).toBeDisabled();
  await toggle.tap();
  await expect(pad).toBeHidden();
  await page.getByRole("button", { name: "Stop game" }).click();
});

test("fits a six-button Sega pad in the original row order on a small phone", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 700 });
  await start(page, /\bMD runtime test/);
  const toggle = page.getByRole("button", { name: "Touch controller" });
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  await expect(page.frameLocator("iframe").locator(".ejs_menu_bar")).toHaveClass(
    /ejs_menu_bar_hidden/,
  );
  const guide = page.getByRole("region", { name: "Keyboard and controller buttons" });
  await expect(guide.getByRole("list")).toBeHidden();
  await toggle.tap();
  const pad = page.getByRole("group", { name: "Touch controller" });
  const position = async (name: string) => {
    const box = await pad.getByRole("button", { name, exact: true }).boundingBox();
    if (!box) throw new Error(`Missing Sega button ${name}`);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    return box;
  };
  const [a, b, c, x, y, z] = await Promise.all([
    position("A"),
    position("B"),
    position("C"),
    position("X"),
    position("Y"),
    position("Z"),
  ]);
  expect(a.y).toBe(b.y);
  expect(b.y).toBe(c.y);
  expect(a.x).toBeLessThan(b.x);
  expect(b.x).toBeLessThan(c.x);
  expect([x.x, y.x, z.x]).toEqual([a.x, b.x, c.x]);
  expect(x.y).toBeLessThan(a.y);
  const right = await position("Right");
  expect(right.x + right.width).toBeLessThanOrEqual(x.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "DOS keyboard" })).toHaveCount(0);
  await page.getByRole("button", { name: "Stop game" }).click();
});

test("types a DOS command entirely by touch and fits phones and tablets", async ({ page }) => {
  test.setTimeout(75_000);
  await start(page, /DOS live edit test/);
  const toggle = page.getByRole("button", { name: "DOS keyboard" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false", { timeout: 30_000 });
  await toggle.tap();
  const keys = page.getByRole("group", { name: "DOS keyboard" });
  const key = (name: string) => keys.getByRole("button", { name, exact: true });
  for (const [width, height] of [
    [320, 700],
    [844, 390],
    [768, 1024],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await keys.scrollIntoViewIfNeeded();
    await expect(key("Enter")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const box = await page.locator("iframe").boundingBox(),
      pad = await keys.boundingBox();
    if (!box || !pad) throw new Error("Missing game or keyboard");
    expect(box.y + box.height <= pad.y + 1 || box.x + box.width <= pad.x + 1).toBe(true);
  }
  await key("F1–F12").tap();
  await expect(key("F12")).toBeVisible();
  await key("ABC").tap();
  for (const letter of "echo") await key(letter).tap();
  await key("Space").tap();
  await key("Shift").tap();
  await key("H").tap();
  await expect(key("Shift")).toHaveAttribute("aria-pressed", "false");
  await key("i").tap();
  await key("123 / #").tap();
  await key("Shift").tap();
  await key(">").tap();
  await key("ABC").tap();
  for (const letter of "slots") await key(letter).tap();
  await key("123 / #").tap();
  await key("\\").tap();
  await key("ABC").tap();
  for (const letter of "second") await key(letter).tap();
  await key("123 / #").tap();
  await key(".").tap();
  await key("ABC").tap();
  for (const letter of "dat") await key(letter).tap();
  await key("Enter").tap();
  await toggle.tap();
  const save = page.getByRole("button", { name: "Save to account" });
  await expect
    .poll(async () => {
      await save.click();
      const link = page.getByRole("link", { name: "slots/SECOND.DAT", exact: true }).first();
      const href = await link.getAttribute("href");
      return href ? (await (await page.request.get(href)).body()).toString().slice(0, 12) : "";
    })
    .toBe("Hi\r\n");
  await page.getByRole("button", { name: "Stop game" }).click();
});
