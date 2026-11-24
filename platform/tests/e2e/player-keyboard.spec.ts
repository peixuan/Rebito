import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { useSession } from "./session.ts";

for (const handoff of ["start", "resume"]) {
  test(`game ${handoff} owns navigation keys without trapping outside controls`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1100, height: 650 });
    await useSession(page.context(), "console");
    await page.goto("/");
    await page
      .getByRole("button")
      .filter({ has: page.getByText("MD runtime test", { exact: true }) })
      .click();
    const name = `Keyboard ${randomUUID()}`;
    await page.getByLabel("Profile name").fill(name);
    await page.getByRole("button", { name: "Create profile" }).click();
    await page
      .locator(".profile-row")
      .filter({ hasText: name })
      .getByRole("button", { name: "Open profile" })
      .click();
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.getByRole("button", { name: "Pause game" })).toBeEnabled({ timeout: 30_000 });
    const runtime = page.frames().find((frame) => frame.url().endsWith("/runtime.html"));
    if (!runtime) throw new Error("Missing real game runtime");
    const pixel = () =>
      runtime.locator("canvas").evaluate(
        (canvas: HTMLCanvasElement) =>
          new Promise<number[]>((resolve) =>
            requestAnimationFrame(() => {
              const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
              if (!gl) throw new Error("Missing real MD frame");
              const value = new Uint8Array(4);
              gl.readPixels(
                canvas.width / 2,
                canvas.height / 2,
                1,
                1,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                value,
              );
              resolve([...value]);
            }),
          ),
      );
    await expect.poll(async () => (await pixel())[2]).toBeGreaterThan(150);
    if (handoff === "resume") {
      await page.getByRole("button", { name: "Pause game" }).click();
      await page.getByRole("button", { name: "Resume game" }).click();
    }
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("IFRAME");
    await page.keyboard.press("ArrowRight", { delay: 100 });
    await expect.poll(async () => (await pixel())[0]).toBeGreaterThan(150);

    // A separate click/hold path catches upstream's early return for repeat events.
    await runtime.locator("canvas").click();
    await runtime.evaluate(() => {
      const host = window as Window & {
        keyboardEvents?: { key: string; repeat: boolean; prevented: boolean }[];
      };
      host.keyboardEvents = [];
      // Observe after the runtime's capture/target handlers have processed the key.
      window.addEventListener("keydown", (event) => {
        host.keyboardEvents?.push({
          key: event.key,
          repeat: event.repeat,
          prevented: event.defaultPrevented,
        });
      });
    });
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(
      true,
    );
    for (const key of ["ArrowDown", "Space"]) {
      await page.keyboard.down(key);
      await page.keyboard.down(key);
      await page.keyboard.up(key);
    }
    expect(
      await runtime.evaluate(
        () => (window as Window & { keyboardEvents?: unknown[] }).keyboardEvents,
      ),
    ).toEqual([
      { key: "ArrowDown", repeat: false, prevented: true },
      { key: "ArrowDown", repeat: true, prevented: true },
      { key: " ", repeat: false, prevented: true },
      { key: " ", repeat: true, prevented: true },
    ]);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.getByRole("combobox", { name: "Language" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.getByRole("button", { name: "Stop game" }).click();
  });
}

test("DOS preserves focus chosen during loading and supports game and editor cursor keys", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await useSession(page.context(), "dos");
  await page.goto("/");
  await page.getByRole("button", { name: /DOS live edit test/ }).click();
  const name = `DOS keyboard ${randomUUID()}`;
  await page.getByLabel("Profile name").fill(name);
  await page.getByRole("button", { name: "Create profile" }).click();
  await page
    .locator(".profile-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Open profile" })
    .click();
  let releaseAsset = () => {};
  let assetRequested = () => {};
  const held = new Promise<void>((resolve) => {
    releaseAsset = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    assetRequested = resolve;
  });
  await page.route(
    "**/api/games/*/asset",
    async (route) => {
      assetRequested();
      await held;
      await route.continue();
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Start game" }).click();
  await requested;
  const language = page.getByRole("combobox", { name: "Language" });
  await language.focus();
  releaseAsset();
  await expect(page.getByRole("button", { name: "Pause game" })).toBeEnabled({ timeout: 30_000 });
  await expect(language).toBeFocused();
  const save = page.getByRole("button", { name: "Save to account" });
  await save.click();
  const editor = page.getByRole("region", { name: "Save editor" });
  await expect(editor.getByLabel("Money", { exact: true })).toHaveValue("123");
  await page.getByRole("button", { name: "Pause game" }).click();
  await page.getByRole("button", { name: "Resume game" }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("IFRAME");
  await page.keyboard.type("echo keyboad", { delay: 30 });
  await page.keyboard.press("ArrowLeft", { delay: 100 });
  await page.keyboard.type("r");
  await page.keyboard.press("End", { delay: 100 });
  await page.keyboard.press("Shift+Period", { delay: 100 });
  await page.keyboard.type(" slots\\second.dat", { delay: 30 });
  await page.keyboard.press("Enter", { delay: 150 });
  await expect
    .poll(async () => {
      await save.click();
      const href = await page
        .getByRole("link", { name: "slots/SECOND.DAT", exact: true })
        .first()
        .getAttribute("href");
      if (!href) return "";
      const bytes = await (await page.request.get(href)).body();
      return bytes.length > 100 ? `Unchanged binary save: ${bytes.length} bytes` : bytes.toString();
    })
    .toBe("keyboard\r\n");
  await page.getByRole("button", { name: "Pause game" }).click();
  await editor.getByRole("button", { name: "Characters", exact: true }).click();
  const input = editor.getByLabel("Search records");
  await input.fill("abcd");
  await input.press("Home");
  await input.press("ArrowRight");
  expect(await input.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(1);
  await input.press("Space");
  await expect(input).toHaveValue("a bcd");
  await page.getByRole("button", { name: "Stop game" }).click();
});
