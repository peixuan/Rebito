import { createHash } from "node:crypto";
import { basename } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { RuntimeHandle, RuntimeProgress, RuntimeWindow } from "../../client/runtime/types.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import type { Game } from "../../src/library/catalog.ts";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { discArchive, discBios, discTrack } from "../library/segacd-fixtures.ts";
import { useSession } from "./session.ts";

type SerializedProgress = Omit<RuntimeProgress, "files"> & {
  files: { name: string; bytes: number[] }[];
};

/** Real core container with synthetic program RAM; never a proprietary game fixture. */
export async function prepareSan3Editor(
  page: Page,
  program: Uint8Array,
  title = "SAN3 strategic editor fixture",
  marker = 0x5a,
) {
  const { file, retry } = test.info();
  await useSession(page.context(), `admin-${basename(file, ".spec.ts")}-${retry}`);
  title = `${title} attempt ${retry + 1}`;
  const track = discTrack();
  track[2000] = marker;
  // Each attempt owns a release, including after a partially completed failed attempt.
  track.set(createHash("sha256").update(title).digest(), 2001);
  const uploaded = await page.request.post("/api/admin/games", {
    headers: { origin: "http://localhost:4317" },
    multipart: {
      metadata: JSON.stringify({
        title,
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
    data: { releaseId: game.id, name: title },
  });
  expect(created.status()).toBe(201);
  const profile: Profile = await created.json();

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
  const stateName = "__runtime/state.bin";
  const state = captured.files.find((file) => file.name === stateName);
  if (!state) throw new Error("Missing captured state");
  const memory = openSnapshotMemory(new Uint8Array(state.bytes), "picodrive", "program");
  const history = async (): Promise<Revision[]> =>
    (await page.request.get(`/api/profiles/${profile.id}/revisions`)).json();
  async function publishMemory(program: Uint8Array) {
    const before = (await history())[0];
    const files = captured.files.map((file) => ({
      ...file,
      bytes: file.name === stateName ? [...memory.replace(program)] : file.bytes,
    }));
    expect(
      await page.evaluate(
        async ({ profile, base, runtime, files }) => {
          const body = new FormData();
          body.append(
            "metadata",
            JSON.stringify({
              kind: "snapshot",
              runtime,
              releaseId: profile.releaseId,
              baseRevision: base,
            }),
          );
          for (const file of files)
            body.append("file", new Blob([new Uint8Array(file.bytes)]), file.name);
          return (await fetch(`/api/profiles/${profile.id}/revisions`, { method: "POST", body }))
            .status;
        },
        { profile, base: before?.id ?? null, runtime: captured.runtime, files },
      ),
    ).toBe(201);
  }
  await publishMemory(program);
  return { game, profile, history, publishMemory };
}
