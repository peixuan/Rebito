import { expect, test } from "@playwright/test";
import { unzipSync, zipSync } from "fflate";
import { useSession } from "./session.ts";

test("edits an uploaded game without uploading again and runs the derived DOS release", async ({
  page,
}) => {
  await useSession(page.context(), "admin");
  await page.goto("/");
  const form = new FormData();
  form.append(
    "metadata",
    JSON.stringify({
      title: "Configuration acceptance",
      system: "dos",
      executable: "PLAY.BAT",
      saveFiles: ["SAVE.DAT"],
    }),
  );
  form.append(
    "file",
    new Blob([zipSync({ "PLAY.BAT": Buffer.from("@echo off\r\necho CONFIG>SAVE.DAT\r\n") })]),
    "fixture.zip",
  );
  const upload = await page.evaluate(
    async (parts) => {
      const body = new FormData();
      body.append("metadata", parts.metadata);
      body.append("file", new Blob([new Uint8Array(parts.bytes)]), "fixture.zip");
      return (await (await fetch("/api/admin/games", { method: "POST", body })).json()).game;
    },
    {
      metadata: String(form.get("metadata")),
      bytes: [...new Uint8Array(await (form.get("file") as Blob).arrayBuffer())],
    },
  );
  const profile = await page.request.post("/api/profiles", {
    headers: { origin: "http://localhost:4317" },
    data: { releaseId: upload.id, name: "Retained progress" },
  });
  expect(profile.status()).toBe(201);
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  await page.getByLabel("Search published games").fill("Configuration acceptance");
  const current = await (
    await page.request.get(`/api/admin/games/${upload.id}/configuration`)
  ).json();
  expect(
    (
      await page.request.post(`/api/admin/games/${upload.id}/configuration`, {
        headers: { origin: "http://localhost:4317" },
        data: { token: current.token, title: "Externally renamed configuration" },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("row")
    .filter({ hasText: "Configuration acceptance" })
    .getByRole("button", { name: "Edit configuration" })
    .click();
  await expect(page.getByLabel("Game file", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Game title", { exact: true })).toHaveValue(
    "Externally renamed configuration",
  );
  await expect(page.getByLabel("Launch executable", { exact: true })).toHaveValue("PLAY.BAT");
  await page.getByLabel("Game title", { exact: true }).fill("Original configuration");
  await page.getByRole("button", { name: "Save configuration", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toContainText(
    "Original configuration",
  );
  await page.getByLabel("Search published games").fill("Original configuration");
  await page
    .getByRole("row")
    .filter({ hasText: "Original configuration" })
    .getByRole("button", { name: "Edit configuration" })
    .click();
  await page.getByLabel("Game title", { exact: true }).fill("Reconfigured release");
  await page.getByLabel("CPU cycles", { exact: true }).fill("5000");
  await page.getByRole("button", { name: "Save configuration", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Published a new release" }),
  ).toContainText("new release");
  const games = await (await page.request.get("/api/games")).json();
  const derived = games.find((game: { title: string }) => game.title === "Reconfigured release");
  expect(derived.id).not.toBe(upload.id);
  const asset = unzipSync(await (await page.request.get(`/api/games/${derived.id}/asset`)).body());
  expect(Buffer.from(asset[".jsdos/dosbox.conf"] ?? []).toString()).toContain("cycles=5000");
  expect(await (await page.request.get("/api/profiles")).json()).toContainEqual(
    expect.objectContaining({ id: (await profile.json()).id, releaseId: upload.id }),
  );
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await page.getByRole("button", { name: /Reconfigured release/ }).click();
  await page.getByLabel("Profile name").fill("New release validation");
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const save = page.getByRole("button", { name: "Save to account", exact: true });
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await expect
    .poll(async () => {
      await save.click();
      await expect(page.getByRole("status")).toContainText("saved to your account");
      return page.getByRole("link", { name: "SAVE.DAT", exact: true }).count();
    })
    .toBeGreaterThan(0);
  const url = await page
    .getByRole("link", { name: "SAVE.DAT", exact: true })
    .first()
    .getAttribute("href");
  expect(await (await page.request.get(url ?? "")).text()).toBe("CONFIG\r\n");
});
