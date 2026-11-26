import { randomUUID } from "node:crypto";
import { expect, type Locator, test } from "@playwright/test";
import { useSession } from "./session.ts";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test("plays a real NES with two thumbs and releases cancelled contacts", async ({ page }) => {
  test.setTimeout(60_000);
  await useSession(page.context(), "player");
  await page.goto("/");
  await page.getByRole("button", { name: /\bNES runtime test/ }).click();
  const name = `Touch ${randomUUID()}`;
  await page.getByLabel("Profile name").fill(name);
  await page.getByRole("button", { name: "Create profile" }).click();
  await page
    .locator(".profile-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Open profile" })
    .click();
  await page.getByRole("button", { name: "Start game" }).click();
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
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect(pad.locator('[data-held="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Pause game" }).click();
  await expect(action).toBeDisabled();
  await toggle.tap();
  await expect(pad).toBeHidden();
  await page.getByRole("button", { name: "Stop game" }).click();
});
