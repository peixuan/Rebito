import { expect, test } from "@playwright/test";
import type { RuntimeHandle } from "../../client/runtime/types.ts";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { openDosWorkspace, writeDosSave } from "./dos-workspace.ts";

test("waits for the published cloud head before restarting after a delayed history refresh", async ({
  page,
}) => {
  await openDosWorkspace(page, "Delayed refresh");
  await writeDosSave(page, "SECOND");
  let release = () => {};
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let waiting = false;
  await page.route("**/api/profiles", async (route) => {
    const response = await route.fetch();
    waiting = true;
    await barrier;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Stop game", exact: true }).click();
    const start = page.getByRole("button", { name: "Start game", exact: true });
    await expect(start).toBeVisible();
    await expect.poll(() => waiting).toBe(true);
    await expect(start).toBeDisabled();
    release();
    await expect(start).toBeEnabled();
    await page.unroute("**/api/profiles");
    await start.click();
    await expect(page.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled();
    const game = page.getByRole("region", { name: "Game window", exact: true });
    await expect(game.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Save to account", exact: true }).click();
    await expect(game.getByRole("status")).toContainText("saved to your account");
    const [profile]: Profile[] = await (await page.request.get("/api/profiles")).json();
    if (!profile) throw new Error("Missing profile");
    const revisions: Revision[] = await (
      await page.request.get(`/api/profiles/${profile.id}/revisions`)
    ).json();
    expect(revisions).toHaveLength(2);
    expect(revisions[0]?.parentId).toBe(revisions[1]?.id);
    for (const revision of revisions) {
      const saved = await page.request.get(`/api/revisions/${revision.id}/file?name=SAVE.DAT`);
      expect(await saved.text()).toBe("SECOND\r\n");
    }
    await page.getByRole("button", { name: "Stop game", exact: true }).click();
  } finally {
    release();
  }
});

test("blocks history restores and imports until an in-flight DOS stop is published", async ({
  page,
}) => {
  await openDosWorkspace(page, "Restore after stop");
  const frame = page.frames().find((entry) => entry.url().endsWith("/runtime.html"));
  if (!frame) throw new Error("Missing DOS runtime");
  await expect
    .poll(() =>
      frame.evaluate(async () => {
        const handle = (window as Window & { testHandle?: RuntimeHandle }).testHandle;
        return new TextDecoder().decode(await handle?.files?.read("SAVE.DAT"));
      }),
    )
    .toBe("FIRST\r\n");
  const save = page.getByRole("button", { name: "Save to account", exact: true });
  async function publish(): Promise<Revision> {
    const response = page.waitForResponse(
      (response) => response.url().endsWith("/revisions") && response.request().method() === "POST",
    );
    await save.click();
    const published = await response;
    expect(published.status()).toBe(201);
    return published.json();
  }
  const first = await publish();
  await writeDosSave(page, "SECOND");
  const second = await publish();
  const restore = page
    .locator(`[data-revision-id="${first.id}"]`)
    .getByRole("button", { name: "Restore this revision", exact: true });
  await expect(restore).toBeEnabled();
  await writeDosSave(page, "THIRD");
  let release = () => {};
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let waiting = false;
  let stopped: Revision | undefined;
  await page.route("**/api/profiles/*/revisions", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    stopped = await response.json();
    waiting = true;
    await barrier;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Stop game", exact: true }).click();
    await expect.poll(() => waiting).toBe(true);
    expect(stopped?.parentId).toBe(second.id);
    await expect(restore).toBeDisabled();
    await expect(page.getByLabel("Save files", { exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole("button", { name: "Start game", exact: true })).toBeEnabled();
    await expect(restore).toBeEnabled();
    await expect(page.getByLabel("Save files", { exact: true })).toBeEnabled();
    const response = page.waitForResponse((entry) => entry.url().endsWith("/restore"));
    await restore.click();
    const restored = await response;
    expect(restored.status()).toBe(201);
    const revision: Revision = await restored.json();
    expect(revision.parentId).toBe(stopped?.id);
    const bytes = await page.request.get(`/api/revisions/${revision.id}/file?name=SAVE.DAT`);
    expect(await bytes.text()).toBe("FIRST\r\n");
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled();
    const restarted = page.frames().find((entry) => entry.url().endsWith("/runtime.html"));
    if (!restarted) throw new Error("Missing restarted DOS runtime");
    await restarted.evaluate(() => {
      const handle = (window as Window & { testHandle?: RuntimeHandle }).testHandle;
      if (!handle) throw new Error("Missing restarted handle");
      handle.capture = async () => {
        throw new Error("Injected capture failure");
      };
    });
    await page.getByRole("button", { name: "Stop game", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Game window", exact: true }).getByRole("alert"),
    ).toBeVisible();
    expect(restarted.isDetached()).toBe(false);
    await expect(restore).toBeEnabled();
    await expect(page.getByLabel("Save files", { exact: true })).toBeEnabled();
  } finally {
    release();
  }
});
