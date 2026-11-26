import { expect, test } from "@playwright/test";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { useSession } from "./session.ts";

test("manages old protected points without replacing the workspace head", async ({ page }) => {
  test.setTimeout(60_000);
  await useSession(page.context(), "history-pages");
  await page.goto("/");
  await page.getByRole("button", { name: /Test game/ }).click();
  await page.getByLabel("Profile name").fill("Older checkpoints");
  await page.getByRole("button", { name: "Create profile" }).click();
  await page.getByRole("button", { name: "Open profile" }).click();
  const [profile]: Profile[] = await (await page.request.get("/api/profiles")).json();
  if (!profile) throw new Error("Missing profile");
  let head: string | null = null;
  const headers = { origin: "http://localhost:4317" };
  for (let index = 0; index < 103; index++) {
    const response = await page.request.post(`/api/profiles/${profile.id}/revisions`, {
      headers,
      multipart: {
        metadata: JSON.stringify({
          kind: "game-save",
          releaseId: profile.releaseId,
          baseRevision: head,
        }),
        file: {
          name: "SAVE.DAT",
          mimeType: "application/octet-stream",
          buffer: Buffer.from(`checkpoint-${index}`),
        },
      },
    });
    expect(response.status()).toBe(201);
    const revision: Revision = await response.json();
    head = revision.id;
    expect(
      (
        await page.request.post(`/api/revisions/${head}/protection`, {
          headers,
          data: { expected: false, protected: true },
        })
      ).status(),
    ).toBe(200);
  }
  await page.getByRole("button", { name: "Refresh saves", exact: true }).click();
  const history = page.getByRole("region", { name: "Revision history", exact: true });
  await expect(history.locator(".revision-row")).toHaveCount(100);
  await history.getByRole("button", { name: "Older history", exact: true }).click();
  await expect(history.locator(".revision-row")).toHaveCount(3);
  const oldest = history.locator(".revision-row").last();
  const id = await oldest.getAttribute("data-revision-id");
  await oldest.getByRole("button", { name: "Remove protection", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove protection" }).click();
  await expect(oldest.getByRole("button", { name: "Protect", exact: true })).toBeEnabled();
  await oldest.getByRole("button", { name: "Protect", exact: true }).click();
  await expect(oldest).toContainText("Protected");
  expect(await oldest.getAttribute("data-revision-id")).toBe(id);
  await history.getByRole("button", { name: "Newest history", exact: true }).click();
  await expect(history.locator(".revision-row")).toHaveCount(100);
  await expect(history.locator(`[data-revision-id="${head}"]`)).toContainText("Current revision");
  const after: Profile[] = await (await page.request.get("/api/profiles")).json();
  expect(after[0]?.headId).toBe(head);
  expect(
    (await page.request.get(`/api/profiles/${profile.id}/revisions?before=bad`)).status(),
  ).toBe(400);
});
