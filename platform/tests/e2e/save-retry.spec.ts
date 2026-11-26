import { expect, test } from "@playwright/test";
import type { RuntimeHandle } from "../../client/runtime/types.ts";
import type { Profile } from "../../src/storage/revisions.ts";
import { openDosWorkspace, writeDosSave } from "./dos-workspace.ts";

test("automatically retries busy DOS autosaves and exit saves without recapturing", async ({
  page,
}) => {
  test.setTimeout(75_000);
  await openDosWorkspace(page, "Automatic queue retry");
  await writeDosSave(page, "SECOND");
  const frame = page.frames().find((entry) => entry.url().endsWith("/runtime.html"));
  if (!frame) throw new Error("Missing DOS frame");
  await frame.evaluate(() => {
    const host = window as Window & { testHandle?: RuntimeHandle; captures?: number };
    if (!host.testHandle) throw new Error("Missing runtime handle");
    const capture = host.testHandle.capture.bind(host.testHandle);
    host.captures = 0;
    host.testHandle.capture = async () => {
      host.captures = (host.captures ?? 0) + 1;
      return capture();
    };
  });
  let attempts = 0;
  await page.route("**/api/profiles/*/revisions", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    if (attempts <= 2 || attempts === 4)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "retry-after": "1" },
        body: '{"error":"upload_busy"}',
      });
    return route.continue();
  });
  await expect(page.getByRole("status")).toContainText(
    "Game progress was automatically saved to your account",
    {
      timeout: 45_000,
    },
  );
  expect(attempts).toBe(3);
  expect(await frame.evaluate(() => (window as Window & { captures?: number }).captures)).toBe(1);
  expect(frame?.isDetached()).toBe(false);
  await expect(page.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled();
  const autosaved = await page
    .getByRole("link", { name: "SAVE.DAT", exact: true })
    .getAttribute("href");
  expect(await (await page.request.get(autosaved ?? "")).text()).toBe("SECOND\r\n");
  await writeDosSave(page, "THIRD");
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start game", exact: true })).toBeVisible();
  expect(attempts).toBe(5);
  const [profile] = (await (await page.request.get("/api/profiles")).json()) as Profile[];
  const history = await (await page.request.get(`/api/profiles/${profile?.id}/revisions`)).json();
  expect(history).toHaveLength(1);
  expect((await page.request.get(autosaved ?? "")).status()).toBe(404);
  const file = await page.request.get(`/api/revisions/${history[0].id}/file?name=SAVE.DAT`);
  expect(await file.text()).toBe("THIRD\r\n");
});

test("never rebases a queued retry over a newer cloud head and preserves local files", async ({
  page,
}) => {
  await openDosWorkspace(page, "Conflict while queued");
  await writeDosSave(page, "THIRD");
  const [profile] = (await (await page.request.get("/api/profiles")).json()) as Profile[];
  if (!profile) throw new Error("Missing profile");
  let attempts = 0;
  await page.route(`**/api/profiles/${profile.id}/revisions`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (++attempts !== 1) return route.continue();
    const remote = await page.request.post(`/api/profiles/${profile.id}/revisions`, {
      headers: { origin: "http://localhost:4317" },
      multipart: {
        metadata: JSON.stringify({
          kind: "game-save",
          releaseId: profile.releaseId,
          baseRevision: null,
        }),
        file: {
          name: "SAVE.DAT",
          mimeType: "application/octet-stream",
          buffer: Buffer.from("REMOTE"),
        },
      },
    });
    expect(remote.status()).toBe(201);
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"upload_busy"}',
    });
  });
  await page.getByRole("button", { name: "Synchronize and refresh", exact: true }).click();
  const game = page.getByRole("region", { name: "Game window", exact: true });
  await expect(game.getByRole("alert")).toContainText("The local game is paused and retained");
  expect(attempts).toBe(2);
  await expect(page.frameLocator("iframe").locator("canvas")).toBeVisible();
  await game
    .getByRole("button", { name: "Save local progress as a new profile", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Local backup/ })).toBeVisible();
  const profiles = (await (await page.request.get("/api/profiles")).json()) as Profile[];
  expect(profiles).toHaveLength(2);
  for (const entry of profiles) {
    const history = await (await page.request.get(`/api/profiles/${entry.id}/revisions`)).json();
    expect(history).toHaveLength(1);
    const saved = await page.request.get(`/api/revisions/${entry.headId}/file?name=SAVE.DAT`);
    expect(await saved.text()).toBe(entry.id === profile.id ? "REMOTE" : "THIRD\r\n");
  }
});

test("preserves a live runtime when a committed save's response is lost without reposting", async ({
  page,
}) => {
  await openDosWorkspace(page, "Lost publication response");
  await writeDosSave(page, "SECOND");
  let attempts = 0;
  await page.route("**/api/profiles/*/revisions", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    const saved = await route.fetch();
    expect(saved.status()).toBe(201);
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Synchronize and refresh", exact: true }).click();
  const game = page.getByRole("region", { name: "Game window", exact: true });
  await expect(game.getByRole("alert")).toBeVisible();
  await expect(game.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  await expect(page.frameLocator("iframe").locator("canvas")).toBeVisible();
  expect(attempts).toBe(1);
  const [profile] = (await (await page.request.get("/api/profiles")).json()) as Profile[];
  const history = await (await page.request.get(`/api/profiles/${profile?.id}/revisions`)).json();
  expect(history).toHaveLength(1);
  const saved = await page.request.get(`/api/revisions/${history[0].id}/file?name=SAVE.DAT`);
  expect(await saved.text()).toBe("SECOND\r\n");
});
