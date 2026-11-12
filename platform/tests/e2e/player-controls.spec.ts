import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { useSession } from "./session.ts";

test("shows live controller bindings, supports remapping and resets them on restart", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await useSession(page.context(), "console");
  await page.goto("/");
  await page
    .getByRole("button")
    .filter({ has: page.getByText("NES runtime test", { exact: true }) })
    .click();
  // Other flows and retries retain profiles for this account; select our own row.
  const profileName = `Control validation ${randomUUID()}`;
  await page.getByLabel("Profile name").fill(profileName);
  await page.getByRole("button", { name: "Create profile" }).click();
  await page
    .locator(".profile-row")
    .filter({ has: page.getByText(profileName, { exact: true }) })
    .getByRole("button", { name: "Open profile" })
    .click();
  await page.getByRole("button", { name: "Start game" }).click();
  const guide = page.getByRole("region", { name: "Keyboard and controller buttons" });
  await expect(guide).toBeVisible({ timeout: 30_000 });
  const aKey = guide
    .getByRole("listitem")
    .filter({ hasText: /→\s*A\s*$/ })
    .locator("kbd");
  await expect(aKey).toHaveText("Z");
  const frame = page.frameLocator("iframe");
  const settings = frame
    .locator(".ejs_popup_container")
    .filter({ has: frame.locator(".ejs_control_body") });
  await page.getByRole("button", { name: "Configure controls" }).click();
  await expect(settings).toBeVisible();
  await settings.locator('.ejs_control_bar[data-index="0"][data-id="8"]').click();
  await page.keyboard.press("b");
  await expect(aKey).toHaveText("B");
  await settings.getByText("Close", { exact: true }).click();
  await frame.locator("canvas").click();
  await page.keyboard.down("b");
  await expect
    .poll(async () => {
      const runtime = page.frames().find((entry) => entry.url().endsWith("/runtime.html"));
      return runtime?.evaluate(
        () =>
          new Promise<boolean>((resolve) =>
            requestAnimationFrame(() => {
              const canvas = document.querySelector("canvas");
              const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
              if (!canvas || !gl) throw new Error("Missing real NES frame");
              const pixel = new Uint8Array(4);
              gl.readPixels(
                canvas.width / 2,
                canvas.height / 2,
                1,
                1,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                pixel,
              );
              resolve((pixel[2] ?? 0) > (pixel[1] ?? 0));
            }),
          ),
      );
    })
    .toBe(true);
  await page.keyboard.up("b");
  await page.getByRole("button", { name: "Configure controls" }).click();
  await settings
    .locator(":scope > .ejs_button")
    .filter({ hasText: /^Clear$/ })
    .click();
  await expect(guide.locator("kbd")).toHaveText(Array(10).fill("Unassigned"));
  await settings.getByText("Reset", { exact: true }).click();
  await expect(aKey).toHaveText("Z");
  await settings.locator('.ejs_control_bar[data-index="0"][data-id="8"]').click();
  await page.keyboard.press("b");
  await expect(aKey).toHaveText("B");
  await settings.getByText("Close", { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(guide.getByRole("listitem")).toHaveCount(10);
  await page.getByRole("button", { name: "Stop game" }).click();
  await expect(guide).toHaveCount(0);
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(aKey).toHaveText("Z", { timeout: 30_000 });
  await page.getByRole("button", { name: "Stop game" }).click();
  expect(errors).toEqual([]);
});
