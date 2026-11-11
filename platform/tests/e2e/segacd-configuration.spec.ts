import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { discArchive, discBios } from "../library/segacd-fixtures.ts";
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
  await select(discBios("E"));
  await page.getByRole("button", { name: "Save configuration", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("does not match");
  await expect(page.getByLabel("Game title", { exact: true })).toHaveValue(
    "Original disc configuration",
  );
  bios[0x1001] = 4;
  await select(bios);
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
