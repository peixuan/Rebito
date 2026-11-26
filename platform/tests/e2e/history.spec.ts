import { expect, test } from "@playwright/test";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { chinese } from "./locales.ts";
import { useSession } from "./session.ts";

test("protects important history and previews bilingual cleanup without changing current progress", async ({
  page,
}, info) => {
  await useSession(page.context(), "history");
  await page.goto("/");
  await page.getByRole("button", { name: /Test game/ }).click();
  await page.getByLabel("Profile name").fill("Protected history");
  await page.getByRole("button", { name: "Create profile" }).click();
  await page.getByRole("button", { name: "Open profile" }).click();
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  const profile = profiles.find((entry) => entry.name === "Protected history");
  if (!profile) throw new Error("Missing profile");
  const revisions: Revision[] = [];
  for (let index = 0; index < 7; index++) {
    const response = await page.request.post(`/api/profiles/${profile.id}/revisions`, {
      headers: { origin: "http://localhost:4317" },
      multipart: {
        metadata: JSON.stringify({
          kind: "game-save",
          releaseId: profile.releaseId,
          baseRevision: revisions.at(-1)?.id ?? null,
        }),
        file: {
          name: "SAVE.DAT",
          mimeType: "application/octet-stream",
          buffer: Buffer.from(`point-${index}`),
        },
      },
    });
    expect(response.status()).toBe(201);
    revisions.push(await response.json());
  }
  await page.getByRole("button", { name: "Refresh saves", exact: true }).click();
  const history = page.getByRole("region", { name: "Revision history", exact: true });
  await expect(history.locator(".revision-row")).toHaveCount(7);
  const oldest = history.locator(`[data-revision-id="${revisions[0]?.id}"]`);
  await oldest.getByRole("button", { name: "Protect", exact: true }).click();
  await expect(oldest).toContainText("Protected");
  await oldest.getByRole("button", { name: "Remove protection", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("eligible for automatic rotation");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await history.getByRole("button", { name: "Review history cleanup" }).click();
  await expect(page.getByRole("dialog")).toContainText("Remove 4 revisions");
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(4);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(history.locator(".revision-row")).toHaveCount(7);
  await history.getByRole("button", { name: "Review history cleanup" }).click();
  const concurrent = revisions[1];
  if (!concurrent) throw new Error("Missing concurrent checkpoint");
  const protection = (expected: boolean, protectedPoint: boolean) =>
    page.request.post(`/api/revisions/${concurrent.id}/protection`, {
      headers: { origin: "http://localhost:4317" },
      data: { expected, protected: protectedPoint },
    });
  expect((await protection(false, true)).status()).toBe(200);
  await page.getByRole("dialog").getByRole("button", { name: "Delete listed history" }).click();
  await expect(history.getByRole("alert")).toContainText("History or protection changed");
  await expect(history.locator(".revision-row")).toHaveCount(7);
  expect((await protection(true, false)).status()).toBe(200);
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await page.getByRole("button", { name: chinese("history.review"), exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("tbody tr")).toHaveCount(4);
  await page.screenshot({ path: info.outputPath("history-cleanup.png"), animations: "disabled" });
  await dialog.getByRole("button", { name: chinese("history.confirm"), exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const translated = page.getByRole("region", { name: chinese("saves.history"), exact: true });
  await expect(translated.locator(".revision-row")).toHaveCount(3);
  const remaining: Revision[] = await (
    await page.request.get(`/api/profiles/${profile.id}/revisions`)
  ).json();
  expect(remaining.map((entry) => entry.id)).toEqual([
    revisions[6]?.id,
    revisions[5]?.id,
    revisions[0]?.id,
  ]);
  for (const index of [0, 6]) {
    const response = await page.request.get(
      `/api/revisions/${revisions[index]?.id}/file?name=SAVE.DAT`,
    );
    expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(Buffer.from(`point-${index}`));
  }
  expect(
    (await page.request.get(`/api/revisions/${revisions[1]?.id}/file?name=SAVE.DAT`)).status(),
  ).toBe(404);
  const after: Profile[] = await (await page.request.get("/api/profiles")).json();
  expect(after.find((entry) => entry.id === profile.id)?.headId).toBe(revisions[6]?.id);
});
