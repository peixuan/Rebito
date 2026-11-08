import { expect, type Page, test } from "@playwright/test";
import type { Profile } from "../../src/storage/revisions.ts";
import { openDosWorkspace, writeDosSave } from "./dos-workspace.ts";

async function conflict(page: Page) {
  await openDosWorkspace(page, "Conflict recovery validation");
  await page.getByRole("button", { name: "Synchronize and refresh", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Game progress was saved to your account");
  const [profile] = (await (await page.request.get("/api/profiles")).json()) as Profile[];
  if (!profile) throw new Error("Missing profile");
  await writeDosSave(page, "THIRD");
  // A genuine second writer advances the same profile; no mocked 409 response.
  const updated = await page.request.post(`/api/profiles/${profile.id}/revisions`, {
    headers: { origin: "http://localhost:4317" },
    multipart: {
      metadata: JSON.stringify({
        kind: "game-save",
        releaseId: profile.releaseId,
        baseRevision: profile.headId,
      }),
      file: {
        name: "SAVE.DAT",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("REMOTE\r\n"),
      },
    },
  });
  expect(updated.status()).toBe(201);
  const remote = await updated.json();
  const frame = page.frames().find((entry) => entry.url().endsWith("/runtime.html"));
  await page.getByRole("button", { name: "Synchronize and refresh", exact: true }).click();
  const game = page.getByRole("region", { name: "Game window", exact: true });
  await expect(game.getByRole("alert")).toContainText("The local game is paused and retained");
  expect(frame?.isDetached()).toBe(false);
  await expect(game.getByRole("button", { name: "Resume game", exact: true })).toBeDisabled();
  return { profile, remote, frame, game };
}

test("preserves both conflict branches and retries a backup whose success response was lost", async ({
  page,
}) => {
  const { profile, remote, frame, game } = await conflict(page);
  let lost = false;
  await page.route("**/api/profiles/*/revisions", async (route) => {
    if (route.request().method() === "POST" && !lost) {
      const result = await route.fetch();
      expect(result.status()).toBe(201);
      lost = true;
      await route.abort("failed");
    } else await route.continue();
  });
  const recover = game.getByRole("button", {
    name: "Save local progress as a new profile",
    exact: true,
  });
  await recover.click();
  await expect(game.getByRole("alert")).toBeVisible();
  await expect(recover).toBeEnabled();
  expect(frame?.isDetached()).toBe(false);
  await recover.click();
  await expect(page.getByRole("heading", { name: /Local backup/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start game", exact: true })).toBeVisible();
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  expect(profiles).toHaveLength(2);
  expect(profiles.find((entry) => entry.id === profile.id)?.headId).toBe(remote.id);
  const backup = profiles.find((entry) => entry.id !== profile.id);
  expect(
    await (await page.request.get(`/api/revisions/${backup?.headId}/file?name=SAVE.DAT`)).text(),
  ).toBe("THIRD\r\n");
  expect(
    await (
      await page.request.get(`/api/revisions/${backup?.headId}/file?name=slots%2FINDEX.DAT`)
    ).text(),
  ).toBe("INDEX FIRST\r\n");
  expect(
    await (await page.request.get(`/api/revisions/${remote.id}/file?name=SAVE.DAT`)).text(),
  ).toBe("REMOTE\r\n");
});

test("requires an explicit discard before using the newer cloud branch", async ({ page }) => {
  const { profile, remote, frame, game } = await conflict(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await game.getByRole("button", { name: "Discard local progress", exact: true }).click();
  expect(frame?.isDetached()).toBe(false);
  page.once("dialog", (dialog) => dialog.accept());
  await game.getByRole("button", { name: "Discard local progress", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start game", exact: true })).toBeVisible();
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  expect(profiles.find((entry) => entry.id === profile.id)?.headId).toBe(remote.id);
  expect(
    await (await page.request.get(`/api/profiles/${profile.id}/revisions`)).json(),
  ).toHaveLength(2);
});
