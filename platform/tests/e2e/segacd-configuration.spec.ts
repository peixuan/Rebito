import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { discArchive, discBios, discCue, discTrack } from "../library/segacd-fixtures.ts";
import { useSession } from "./session.ts";

test("replaces BIOS without a disc upload and preserves old private profiles", async ({ page }) => {
  await useSession(page.context(), "admin-cd");
  const bios = discBios();
  bios[0x1001] = 3;
  const upload = await page.request.post("/api/admin/games", {
    headers: { origin: "http://localhost:4317" },
    multipart: {
      metadata: JSON.stringify({
        title: "Original disc configuration",
        system: "segacd",
        firmware: bios.toString("base64"),
      }),
      file: { name: "disc.zip", mimeType: "application/zip", buffer: Buffer.from(discArchive()) },
    },
  });
  expect(upload.status()).toBe(201);
  const original = (await upload.json()).game;
  const profile = await page.request.post("/api/profiles", {
    headers: { origin: "http://localhost:4317" },
    data: { releaseId: original.id, name: "Retained disc progress" },
  });
  expect(profile.status()).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  await page.getByLabel("Search published games").fill("Original disc configuration");
  await page.getByRole("button", { name: "Edit configuration", exact: true }).click();
  await expect(page.getByLabel("Game file", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Current BIOS region: J/)).toBeVisible();
  const input = page.getByLabel("BIOS file", { exact: true });
  async function select(buffer: Buffer) {
    await input.setInputFiles({
      name: "firmware.bin",
      mimeType: "application/octet-stream",
      buffer,
    });
  }
  await select(Buffer.alloc(8));
  await expect(page.getByRole("alert")).toContainText("128 KiB");
  expect(await input.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(false);
  await select(Buffer.alloc(131072));
  await page.getByRole("button", { name: "Store BIOS", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("128 KiB");
  await expect(page.getByLabel("Game title", { exact: true })).toHaveValue(
    "Original disc configuration",
  );
  bios[0x1001] = 4;
  await select(bios);
  await page.getByRole("button", { name: "Store BIOS", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "BIOS stored" })).toBeVisible();
  const originalAsset = unzipSync(
    await (await page.request.get(`/api/games/${original.id}/asset`)).body(),
  );
  expect(originalAsset["bios_CD_J.bin"]?.[0x1001]).toBe(3);
  await page.getByLabel("Use the current shared BIOS for this region").check();
  await page.getByLabel("Game title", { exact: true }).fill("Updated disc configuration");
  await page.getByRole("button", { name: "Save configuration", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Published a new release" }),
  ).toContainText("new release");
  await expect(input).toHaveValue("");
  const games = await (await page.request.get("/api/games")).json();
  const derived = games.find(
    (game: { title: string }) => game.title === "Updated disc configuration",
  );
  expect(derived.id).not.toBe(original.id);
  const asset = unzipSync(await (await page.request.get(`/api/games/${derived.id}/asset`)).body());
  expect(asset["bios_CD_J.bin"]).toEqual(new Uint8Array(bios));
  expect(await (await page.request.get("/api/profiles")).json()).toContainEqual(
    expect.objectContaining({ id: (await profile.json()).id, releaseId: original.id }),
  );
});

test("uploads two discs with one automatically identified regional BIOS", async ({ page }) => {
  await useSession(page.context(), "admin-cd");
  await page.goto("/");
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  const shared = page.getByRole("region", { name: "Shared Mega CD BIOS", exact: true });
  await page.getByRole("combobox", { name: "Upload platform" }).click();
  await page.getByRole("option", { name: "Mega CD / Sega CD", exact: true }).click();
  await shared.getByLabel("BIOS file", { exact: true }).setInputFiles({
    name: "unknown.bin",
    mimeType: "application/octet-stream",
    buffer: discBios("U"),
  });
  await shared.getByRole("button", { name: "Store BIOS", exact: true }).click();
  await expect(shared.getByRole("status")).toContainText("BIOS stored");
  await expect(shared).toContainText("USA: Available");
  for (const marker of [21, 22]) {
    const track = discTrack("U");
    track[0x1000] = marker;
    await page.getByLabel("Game title", { exact: true }).fill(`Shared firmware disc ${marker}`);
    await page.getByLabel("Game file", { exact: true }).setInputFiles({
      name: "disc.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(discArchive(discCue, { "game.bin": track })),
    });
    await page.getByRole("button", { name: "Publish to library", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: `Published Shared firmware disc ${marker}` }),
    ).toBeVisible();
    await expect(shared.getByLabel("BIOS file", { exact: true })).toHaveValue("");
  }
});
