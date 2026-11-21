import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import type { RuntimeHandle } from "../../client/runtime/types.ts";
import type { Profile } from "../../src/storage/revisions.ts";
import { openDosWorkspace } from "./dos-workspace.ts";

type TimerWindow = Window & { requestAutosave?: () => void };
export type ObservedWindow = Window & { testHandle?: RuntimeHandle; events?: string[] };

/** Exercise the real scheduled callback without advancing the emulator's clock. */
export async function autosaveWorkspace(page: Page) {
  await page.addInitScript(() => {
    const interval = window.setInterval;
    window.setInterval = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 30_000 && typeof callback === "function")
        (window as TimerWindow).requestAutosave = () => callback(...args);
      return interval(callback, delay, ...args);
    }) as typeof window.setInterval;
  });
  const name = `Background save ${randomUUID()}`;
  await openDosWorkspace(page, name, "autosave");
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  const profile = profiles.find((entry) => entry.name === name);
  if (!profile) throw new Error("Missing profile");
  const frame = page.frames().find((entry) => entry.url().endsWith("/runtime.html"));
  if (!frame) throw new Error("Missing DOS frame");
  await expect
    .poll(() =>
      frame.evaluate(async () => {
        const handle = (window as ObservedWindow).testHandle;
        return new TextDecoder().decode(await handle?.files?.read("SAVE.DAT"));
      }),
    )
    .toBe("FIRST\r\n");
  await page.getByRole("button", { name: "Save to account", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved to your account");
  await frame.evaluate(() => {
    const host = window as ObservedWindow;
    const handle = host.testHandle;
    if (!handle?.readNativeFiles) throw new Error("Missing native observation");
    const events: string[] = [];
    host.events = events;
    for (const method of ["capture", "readNativeFiles", "pause", "resume"] as const) {
      const original = handle[method];
      if (!original) throw new Error(`Missing runtime method: ${method}`);
      Object.assign(handle, {
        [method]: () => {
          events.push(method);
          return original();
        },
      });
    }
  });
  return {
    profile,
    frame,
    tick: () =>
      page.evaluate(() => {
        const tick = (window as TimerWindow).requestAutosave;
        if (!tick) throw new Error("Missing 30-second autosave timer");
        tick();
      }),
    events: () => frame.evaluate(() => (window as ObservedWindow).events ?? []),
    async savedFile(name: string) {
      const link = page.getByRole("link", { name, exact: true }).first();
      const url = await link.getAttribute("href");
      if (!url) throw new Error("Missing cloud file");
      return (await page.request.get(url)).text();
    },
  };
}
