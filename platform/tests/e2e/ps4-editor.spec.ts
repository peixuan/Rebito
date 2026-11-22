import { expect, test } from "@playwright/test";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { ps4FixtureRom } from "../library/ps4-fixture.ts";
import { chinese } from "./locales.ts";
import { useSession } from "./session.ts";

test("associates the MD editor and applies bilingual drafts to the paused running game", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await useSession(page.context(), "admin-ps4");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const uploaded = await page.request.post("/api/admin/games", {
    headers: { origin: "http://localhost:4317" },
    multipart: {
      metadata: JSON.stringify({ title: "PS4 memory editor fixture", system: "md" }),
      file: {
        name: "fixture.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(ps4FixtureRom()),
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  await page.getByLabel("Search published games").fill("PS4 memory editor fixture");
  await page
    .getByRole("row")
    .filter({ hasText: "PS4 memory editor fixture" })
    .getByRole("button", { name: "Edit configuration" })
    .click();
  await page.getByLabel("Save editor", { exact: true }).click();
  await page.getByRole("option", { name: "Phantasy Star IV (MD)", exact: true }).click();
  await page.getByRole("button", { name: "Save configuration", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await page.getByRole("button", { name: /PS4 memory editor fixture/ }).click();
  await page.getByLabel("Profile name").fill("Memory editing");
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const capture = page.getByRole("button", { name: "Capture for editing", exact: true });
  await expect(capture).toBeEnabled({ timeout: 30_000 });
  await capture.click();
  const editor = page.getByRole("region", { name: "Save editor" });
  await expect(editor).toContainText("Verified with Ken Tse Chinese 1.6");
  await expect(editor.getByLabel("HP", { exact: true })).toHaveValue("40");
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  const profile = profiles.find((entry) => entry.name === "Memory editing");
  if (!profile) throw new Error("Missing profile");
  const history = async (): Promise<Revision[]> =>
    (await page.request.get(`/api/profiles/${profile.id}/revisions`)).json();
  const original = (await history())[0];
  if (!original) throw new Error("Missing captured revision");
  await editor.getByLabel("HP", { exact: true }).fill("-");
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeDisabled();
  await editor.getByLabel("HP", { exact: true }).press("Tab");
  await expect(editor.getByLabel("HP", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Save files", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Stop game", exact: true })).toBeDisabled();
  await editor.getByLabel("HP", { exact: true }).fill("30");
  await editor.getByLabel("HP", { exact: true }).press("Tab");
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(
    page
      .getByRole("region", { name: chinese("editor.title"), exact: true })
      .getByLabel(chinese("phantasyStar4.health"), { exact: true }),
  ).toHaveValue("30");
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeDisabled();
  await editor.getByRole("button", { name: "Party", exact: true }).click();
  await editor.getByLabel("Meseta", { exact: true }).fill("12345");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  const edited = (await history())[0];
  expect(edited?.parentId).toBe(original.id);
  expect(edited?.source).toBe("editor");
  expect(edited?.manifest.runtime).toEqual(original.manifest.runtime);
  expect(edited?.manifest.artifacts.find((file) => file.name === "save.srm")).toEqual(
    original.manifest.artifacts.find((file) => file.name === "save.srm"),
  );
  await page.getByRole("button", { name: "Save to account", exact: true }).click();
  await expect.poll(async () => (await history()).length).toBe(3);
  const captured = (await history())[0];
  const state = await page.request.get(
    `/api/revisions/${captured?.id}/file?name=__runtime%2Fstate.bin`,
  );
  const memory = openSnapshotMemory(new Uint8Array(await state.body()), "genesis_plus_gx").bytes;
  const data = new DataView(memory.buffer);
  expect(data.getUint32(0xf438)).toBe(12345);
  expect(data.getUint16(0xf50e)).toBe(30);

  // A failed post-publication preview must not move the editor back to its old head.
  let published = false;
  let failedPreview = false;
  await page.route("**/api/revisions/*/editor", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    published = true;
    await route.fulfill({ response });
  });
  await page.route("**/api/revisions/*/editor/preview", async (route) => {
    if (published && !failedPreview) {
      failedPreview = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await editor.getByLabel("Meseta", { exact: true }).fill("12400");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("alert")).toBeVisible();
  expect(failedPreview).toBe(true);
  expect(await history()).toHaveLength(4);
  await editor.getByRole("button", { name: "Discard draft and reload", exact: true }).click();
  await editor.getByRole("button", { name: "Party", exact: true }).click();
  await expect(editor.getByLabel("Meseta", { exact: true })).toHaveValue("12400");
  await expect(editor.getByRole("alert")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
