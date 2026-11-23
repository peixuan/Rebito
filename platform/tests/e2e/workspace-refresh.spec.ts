import { expect, test } from "@playwright/test";
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
