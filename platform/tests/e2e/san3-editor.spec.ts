import { expect, test } from "@playwright/test";
import type { RuntimeHandle, RuntimeProgress, RuntimeWindow } from "../../client/runtime/types.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import type { Game } from "../../src/library/catalog.ts";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { discArchive, discBios, discTrack } from "../library/segacd-fixtures.ts";
import { chinese } from "./locales.ts";
import { useSession } from "./session.ts";

/** Synthetic strategic records only; the original fixture firmware never executes game commands. */
function strategicMemory() {
  const bytes = new Uint8Array(san3Layout.size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0x78000, 0x4b4f4549);
  view.setUint32(0x78776, 0x4b4f4549);
  view.setUint16(0x78788, 200);
  for (let index = 0; index < san3Layout.factions.count; index++)
    view.setUint16(san3Layout.factions.offset + index * san3Layout.factions.stride, 0xffff);
  view.setUint16(san3Layout.factions.offset, 0);
  view.setUint32(san3Layout.factions.offset + 2, san3Layout.cities.offset);
  for (let index = 0; index < san3Layout.cities.count; index++) {
    const offset = san3Layout.cities.offset + index * san3Layout.cities.stride;
    for (const relative of [4, 6, 8, 10]) view.setUint16(offset + relative, 0xffff);
    bytes[offset + 0x14] = index === 0 ? 0 : 0xff;
    view.setUint16(offset + 0x0c, 700);
    view.setUint16(offset + 0x0e, 1500);
    view.setUint32(offset + 0x10, 25_000);
  }
  for (let index = 0; index < san3Layout.officers.count; index++)
    bytes[san3Layout.officers.offset + index * san3Layout.officers.stride + 0x0c] = 7;
  for (const [index, name] of ["Ruler", "General"].entries()) {
    const offset = san3Layout.officers.offset + index * san3Layout.officers.stride;
    const base = san3Layout.historical.offset + index * san3Layout.historical.stride;
    bytes[offset + 0x0c] = index === 0 ? 0 : 3;
    bytes[offset + 0x0f] = 90;
    view.setUint16(offset + 2, 2000);
    bytes.set([70, 60, 80, 90, 50, 40], base + 5);
    bytes.set(new TextEncoder().encode(name), base + 15);
  }
  bytes.set(new TextEncoder().encode("Harbor"), san3Layout.territories.offset + 10);
  bytes[123] = 219;
  return bytes;
}

type SerializedProgress = Omit<RuntimeProgress, "files"> & {
  files: { name: string; bytes: number[] }[];
};

test("edits bilingual Mega-CD strategic drafts and verifies the running PicoDrive checkpoint", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await useSession(page.context(), "admin-san3");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const track = discTrack();
  track[2000] = 0x5a; // Give this original fixture a release distinct from other CD tests.
  const uploaded = await page.request.post("/api/admin/games", {
    headers: { origin: "http://localhost:4317" },
    multipart: {
      metadata: JSON.stringify({
        title: "SAN3 strategic editor fixture",
        system: "segacd",
        firmware: discBios().toString("base64"),
        allowUnrecognizedFirmware: true,
      }),
      file: {
        name: "fixture.zip",
        mimeType: "application/zip",
        buffer: Buffer.from(discArchive(undefined, { "game.bin": track })),
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  const game: Game = (await uploaded.json()).game;
  await page.goto("/");
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  await page.getByLabel("Search published games").fill(game.title);
  await page.getByRole("button", { name: "Edit configuration", exact: true }).click();
  await page.getByLabel("Save editor", { exact: true }).click();
  await page
    .getByRole("option", { name: "Romance of the Three Kingdoms III (Mega-CD)", exact: true })
    .click();
  await page.getByRole("button", { name: "Save configuration", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  const created = await page.request.post("/api/profiles", {
    headers: { origin: "http://localhost:4317" },
    data: { releaseId: game.id, name: "Strategic editing" },
  });
  expect(created.status()).toBe(201);
  const profile: Profile = await created.json();

  // Obtain the actual pinned core container through the public runtime boundary.
  await page.goto("/runtime.html");
  const captured = await page.evaluate(
    async ({ game, profile }): Promise<SerializedProgress> => {
      const host = window as RuntimeWindow;
      if (!host.retroRuntime) throw new Error("Missing runtime host");
      const handle: RuntimeHandle = await host.retroRuntime.start({
        game,
        profileId: profile.id,
        gameBytes: new Uint8Array(await (await fetch(`/api/games/${game.id}/asset`)).arrayBuffer()),
        progress: null,
      });
      const progress = await handle.capture();
      await handle.stop();
      if (progress?.kind !== "snapshot") throw new Error("Missing CD state");
      return {
        ...progress,
        files: progress.files.map((file) => ({ ...file, bytes: [...file.bytes] })),
      };
    },
    { game, profile },
  );
  const state = captured.files.find((file) => file.name === "__runtime/state.bin");
  if (!state) throw new Error("Missing captured state");
  const memory = openSnapshotMemory(new Uint8Array(state.bytes), "picodrive", "program");
  state.bytes = [...memory.replace(strategicMemory())];
  const status = await page.evaluate(
    async ({ profile, progress }) => {
      const body = new FormData();
      body.append(
        "metadata",
        JSON.stringify({
          kind: progress.kind,
          runtime: progress.runtime,
          releaseId: profile.releaseId,
          baseRevision: null,
        }),
      );
      for (const file of progress.files)
        body.append("file", new Blob([new Uint8Array(file.bytes)]), file.name);
      return (await fetch(`/api/profiles/${profile.id}/revisions`, { method: "POST", body }))
        .status;
    },
    { profile, progress: captured },
  );
  expect(status).toBe(201);
  const history = async (): Promise<Revision[]> =>
    (await page.request.get(`/api/profiles/${profile.id}/revisions`)).json();

  await page.goto("/");
  await page.getByRole("button", { name: /SAN3 strategic editor fixture/ }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const capture = page.getByRole("button", { name: "Capture for editing", exact: true });
  await expect(capture).toBeEnabled({ timeout: 30_000 });
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
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
    await capture.click();
    await expect.poll(() => waiting).toBe(true);
    await expect(editor.getByLabel("Population", { exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await page.unroute("**/api/profiles");
  await expect(editor.getByLabel("Gold", { exact: true })).toHaveValue("1500");
  const original = (await history())[0];
  if (!original) throw new Error("Missing editing base");
  for (const [label, value] of [
    ["Population", "123400"],
    ["Gold", "12345"],
    ["Food", "234567"],
  ]) {
    if (!label || !value) throw new Error("Missing city edit");
    await editor.getByLabel(label, { exact: true }).fill(value);
    await editor.getByLabel(label, { exact: true }).press("Tab");
  }
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await expect(editor.getByLabel("Loyalty", { exact: true })).toBeDisabled();
  await editor.getByRole("row").filter({ hasText: "General" }).click();
  for (const [label, value] of [
    ["Soldiers", "8765"],
    ["Loyalty", "89"],
    ["Training", "67"],
    ["Morale", "78"],
    ["Land leadership", "91"],
    ["Naval leadership", "92"],
    ["Strength", "93"],
    ["Intelligence", "94"],
    ["Politics", "95"],
    ["Charisma", "96"],
  ]) {
    if (!label || !value) throw new Error("Missing officer edit");
    await editor.getByLabel(label, { exact: true }).fill(value);
    await editor.getByLabel(label, { exact: true }).press("Tab");
  }
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(
    page
      .getByRole("region", { name: chinese("editor.title"), exact: true })
      .getByLabel(chinese("san3.soldiers"), { exact: true }),
  ).toHaveValue("8765");
  await expect(page.getByLabel(chinese("san3.strength"), { exact: true })).toHaveValue("93");
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor.getByRole("button", { name: "Factions", exact: true }).click();
  await expect(editor.getByLabel("Gold", { exact: true })).toBeDisabled();
  await expect(editor.getByLabel("Gold", { exact: true })).toHaveValue("12345");
  await expect(editor.getByLabel("Soldiers", { exact: true })).toHaveValue("10765");
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Save files", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Restore this revision" }).first()).toBeDisabled();
  const failedDownloads: string[] = [];
  await page.route(
    "**/api/revisions/*/file?name=__runtime%2Fstate.bin",
    async (route) => {
      failedDownloads.push(route.request().url());
      await route.abort("failed");
    },
    { times: 1 },
  );
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const retry = page.getByRole("button", { name: "Retry edit synchronization", exact: true });
  await expect(retry).toBeEnabled();
  await expect(page.getByLabel("Save files", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Restore this revision" }).first()).toBeDisabled();
  for (const name of ["Resume game", "Save to account", "Stop game", "Capture for editing"])
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  const publishedHistory = await history();
  const edited = publishedHistory[0];
  expect(failedDownloads).toHaveLength(1);
  expect(failedDownloads[0]).toContain(`/api/revisions/${edited?.id}/file?`);
  expect(publishedHistory).toHaveLength(3);
  expect(edited?.parentId).toBe(original.id);
  expect(edited?.source).toBe("editor");
  expect(edited?.manifest.runtime).toEqual(original.manifest.runtime);
  expect(edited?.manifest.artifacts.find((file) => file.name === "save.srm")).toEqual(
    original.manifest.artifacts.find((file) => file.name === "save.srm"),
  );
  await retry.click();
  await expect(retry).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  expect(await history()).toEqual(publishedHistory);
  await page.getByRole("button", { name: "Save to account", exact: true }).click();
  await expect.poll(async () => (await history()).length).toBe(4);
  const latest = (await history())[0];
  const saved = await page.request.get(
    `/api/revisions/${latest?.id}/file?name=__runtime%2Fstate.bin`,
  );
  const result = openSnapshotMemory(
    new Uint8Array(await saved.body()),
    "picodrive",
    "program",
  ).bytes;
  const document = new San3Document(result);
  expect(document.city(0)).toMatchObject({ population: 123_400, gold: 12_345, food: 234_567 });
  expect(document.officer(1)).toMatchObject({
    soldiers: 8765,
    loyalty: 89,
    training: 67,
    morale: 78,
  });
  expect(Object.values(document.attributes(1))).toEqual([91, 92, 93, 94, 95, 96]);
  expect(document.officer(1).soldierLimit).toBe(19_200);
  expect(result[123]).toBe(219);
  expect(errors).toEqual([]);
});
