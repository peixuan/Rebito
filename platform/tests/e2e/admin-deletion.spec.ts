import { expect, test } from "@playwright/test";
import { zipSync } from "fflate";
import { useSession } from "./session.ts";

test("confirms affected progress, rejects stale consent and preserves a deleted game's live runtime", async ({
  page,
  browser,
}, info) => {
  await useSession(page.context(), "admin");
  const origin = "http://localhost:4317";
  const uploaded = await page.request.post("/api/admin/games", {
    headers: { origin },
    multipart: {
      metadata: JSON.stringify({
        title: "Deletion acceptance",
        system: "dos",
        executable: "PLAY.BAT",
        saveFiles: ["SAVE.DAT"],
      }),
      file: {
        name: "fixture.zip",
        mimeType: "application/zip",
        buffer: Buffer.from(
          zipSync({ "PLAY.BAT": Buffer.from("@echo off\r\necho DELETE>SAVE.DAT\r\n") }),
        ),
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  const game = (await uploaded.json()).game;
  const context = await browser.newContext();
  try {
    await useSession(context, "other");
    const player = await context.newPage();
    await player.goto(origin);
    await player.getByRole("button", { name: /Deletion acceptance/ }).click();
    await player.getByLabel("Profile name").fill("Active game progress");
    await player.getByRole("button", { name: "Create profile", exact: true }).click();
    await player.getByRole("button", { name: "Open profile", exact: true }).click();
    await player.getByRole("button", { name: "Start game", exact: true }).click();
    const save = player.getByRole("button", { name: "Save to account", exact: true });
    await expect(save).toBeEnabled({ timeout: 30_000 });
    await expect
      .poll(async () => {
        await save.click();
        await expect(player.getByRole("status")).toContainText("saved to your account");
        return player.getByRole("link", { name: "SAVE.DAT", exact: true }).count();
      })
      .toBeGreaterThan(0);
    const download = await player
      .getByRole("link", { name: "SAVE.DAT", exact: true })
      .first()
      .getAttribute("href");
    await page.goto("/");
    await page.getByRole("button", { name: "Game management", exact: true }).click();
    await page.getByLabel("Search published games").fill(game.title);
    await page
      .getByRole("row")
      .filter({ hasText: game.title })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    const confirm = page.getByRole("region", { name: "Confirm game deletion" });
    await expect(confirm).toContainText("Save revisions");
    const remove = confirm.getByRole("button", { name: "Delete permanently", exact: true });
    await expect(remove).toBeDisabled();
    await page.getByLabel("Type the game title to confirm").fill(game.title);
    await expect(remove).toBeDisabled();
    await page.getByRole("checkbox").check();
    expect(
      (
        await context.request.post(`${origin}/api/profiles`, {
          headers: { origin },
          data: { releaseId: game.id, name: "Progress created after confirmation" },
        })
      ).status(),
    ).toBe(201);
    await remove.click();
    await expect(confirm.getByRole("alert")).toContainText("have changed");
    await expect(page.getByLabel("Type the game title to confirm")).toHaveValue("");
    await page.getByLabel("Type the game title to confirm").fill(game.title);
    await page.getByRole("checkbox").check();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.screenshot({ path: info.outputPath("delete-confirmation.png") });
    await remove.click();
    await expect(page.getByRole("status").filter({ hasText: "Deleted" })).toContainText(
      "Reclaimed",
    );
    expect((await context.request.get(`${origin}${download}`)).status()).toBe(404);
    await save.click();
    await expect(
      player.getByRole("region", { name: "Game window", exact: true }).getByRole("alert"),
    ).toContainText("no longer exists");
    await expect(player.frameLocator("iframe").locator("canvas")).toBeVisible();
    expect(
      (await (await page.request.get("/api/games")).json()).some(
        (entry: { id: string }) => entry.id === game.id,
      ),
    ).toBe(false);
  } finally {
    await context.close();
  }
});
