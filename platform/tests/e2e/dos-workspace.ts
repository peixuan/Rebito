import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import type { RuntimeHandle, RuntimeHost, RuntimeWindow } from "../../client/runtime/types.ts";

/** Observe the real runtime without replacing its filesystem or publication path. */
export async function openDosWorkspace(page: Page, name: string) {
  await page.addInitScript(() => {
    const host = window as RuntimeWindow & { testHandle?: RuntimeHandle };
    let runtime: RuntimeHost;
    Object.defineProperty(window, "retroRuntime", {
      configurable: true,
      get: () => runtime,
      set(value: RuntimeHost) {
        runtime = {
          async start(launch) {
            host.testHandle = await value.start(launch);
            return host.testHandle;
          },
        };
      },
    });
  });
  const registered = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin: "http://localhost:4317" },
    data: { name, email: `${randomUUID()}@example.test`, password: "browser-test-password-123" },
  });
  expect(registered.ok()).toBe(true);
  await page.goto("/");
  await page.getByRole("button", { name: /DOS save test/ }).click();
  await page.getByLabel("Profile name").fill(name);
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await page
    .getByText(name, { exact: true })
    .locator("..")
    .getByRole("button", { name: "Open profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled({
    timeout: 30_000,
  });
}

export async function writeDosSave(page: Page, value: "SECOND" | "THIRD") {
  await page.frameLocator("iframe").locator("canvas").click();
  await page.keyboard.type(`copy /y ${value}.DAT SAVE.DAT`, { delay: 50 });
  await page.keyboard.press("Enter", { delay: 150 });
  const frame = page.frames().find((entry) => entry.url().endsWith("/runtime.html"));
  await expect
    .poll(() =>
      frame?.evaluate(async () => {
        const handle = (window as Window & { testHandle?: RuntimeHandle }).testHandle;
        return new TextDecoder().decode(await handle?.files?.read("SAVE.DAT"));
      }),
    )
    .toBe(`${value}\r\n`);
}
