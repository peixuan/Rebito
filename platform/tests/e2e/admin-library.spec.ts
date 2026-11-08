import { expect, test } from "@playwright/test";
import { zipSync } from "fflate";
import { useSession } from "./session.ts";

test("publishes a DOS game from the administrator page and retains a rejected draft", async ({
  page,
}, info) => {
  await useSession(page.context(), "admin");
  await page.goto("/");
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  await page.getByLabel("Game title", { exact: true }).fill("Browser upload validation");
  await page.getByLabel("Game file", { exact: true }).setInputFiles({
    name: "fixture.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(
      zipSync({
        "PLAY.BAT": Buffer.from(
          "@echo off\r\necho NEW>SAVE.DAT\r\nmd slots\r\necho INDEX>slots\\INDEX.DAT\r\n",
        ),
        "SAVE.DAT": Buffer.from("private"),
      }),
    ),
  });
  await expect(page.getByLabel("Launch executable", { exact: true })).toHaveValue("PLAY.BAT");
  await page.getByLabel("Save files to synchronize").fill("SAVE.DAT\nslots/INDEX.DAT");
  await page.getByLabel("Launch executable", { exact: true }).fill("MISSING.EXE");
  await page.getByRole("button", { name: "Publish to library", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("The launch executable is missing");
  await expect(page.getByLabel("Game title", { exact: true })).toHaveValue(
    "Browser upload validation",
  );
  await page.getByLabel("Launch executable", { exact: true }).fill("PLAY.BAT");
  await page.getByRole("button", { name: "Publish to library", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published Browser upload validation");
  await expect(page.getByRole("status")).toContainText("Removed bundled saves: SAVE.DAT");
  await page.getByLabel("Search published games").fill("Browser upload validation");
  await expect(
    page.getByRole("cell", { name: "Browser upload validation", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Game title", { exact: true })).toHaveValue("");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("admin-mobile.png") });
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await expect(page.getByRole("button", { name: /Browser upload validation/ })).toBeVisible();
});

test("hides game management from ordinary players and protects unpublished administrator drafts", async ({
  page,
}) => {
  await useSession(page.context(), "other");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Game library/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Game management", exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/admin/games")).status()).toBe(403);
  await useSession(page.context(), "admin");
  await page.reload();
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  await page.getByLabel("Game title", { exact: true }).fill("Unpublished draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await expect(page.getByLabel("Game title", { exact: true })).toHaveValue("Unpublished draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await expect(page.getByRole("button", { name: "Game management", exact: true })).toBeVisible();
});
