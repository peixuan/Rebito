import { expect, test } from "@playwright/test";
import { zipSync } from "fflate";
import { gameSystems } from "../../src/domain/systems.ts";
import { nesFixture } from "../library/nes-fixture.ts";
import { mdFixture, sega8Fixture, smdFixture } from "../library/sega-fixtures.ts";
import { discArchive, discBios } from "../library/segacd-fixtures.ts";
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
  await page.getByLabel("Save editor", { exact: true }).click();
  await page.getByRole("option", { name: "Uncharted Waters II", exact: true }).click();
  await expect(
    page.getByText(/Administrators must confirm that the game version is suitable/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish to library", exact: true }).click();
  const published = page.getByRole("status").filter({ hasText: "Published" });
  await expect(published).toContainText("Published Browser upload validation");
  await expect(published).toContainText("Removed bundled saves: SAVE.DAT");
  await page.getByLabel("Search published games").fill("Browser upload validation");
  await expect(page.getByRole("cell", { name: /Browser upload validation/ })).toContainText(
    "Editor: Uncharted Waters II",
  );
  await expect(page.getByLabel("Game title", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Save editor", { exact: true })).toContainText("No save editor");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("admin-mobile.png") });
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await expect(page.getByRole("button", { name: /Browser upload validation/ })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: /Browser upload validation/ }).click();
  await page.getByLabel("Profile name").fill("Uploaded game acceptance");
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const save = page.getByRole("button", { name: "Save to account", exact: true });
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await expect
    .poll(async () => {
      await save.click();
      await expect(page.getByRole("status")).toContainText("saved to your account");
      return page.getByRole("link", { name: "slots/INDEX.DAT", exact: true }).count();
    })
    .toBeGreaterThan(0);
  for (const [name, expected] of [
    ["SAVE.DAT", "NEW\r\n"],
    ["slots/INDEX.DAT", "INDEX\r\n"],
  ] as const) {
    const url = await page.getByRole("link", { name, exact: true }).first().getAttribute("href");
    expect(await (await page.request.get(url ?? "")).text()).toBe(expected);
  }
  await page.route("**/api/profiles/*/revisions", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 503, json: { error: "unavailable" } })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Game window", exact: true }).getByRole("alert"),
  ).toBeVisible();
  await expect(page.frameLocator("iframe").locator("canvas")).toBeVisible();
  await expect(page.getByLabel("Game title", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/profiles/*/revisions");
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  await expect(page.getByLabel("Game title", { exact: true })).toBeVisible();
});

for (const [system, extension, fixture] of [
  ["nes", "nes", nesFixture],
  ["md", "md", mdFixture],
  ["md", "smd", smdFixture],
  ["sms", "sms", () => sega8Fixture()],
  ["gg", "gg", () => sega8Fixture(true)],
  ["segacd", "zip", discArchive],
] as const) {
  test(`uploads, saves and resumes ${extension} through administration`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    const title = `Console upload ${extension}`;
    // Separate flows must not spend another test's per-user request budget.
    await useSession(page.context(), `admin-console-${extension}`);
    await page.goto("/");
    await page.getByRole("button", { name: "Game management", exact: true }).click();
    await page.getByLabel("Game title", { exact: true }).fill(title);
    await page.getByRole("combobox", { name: "Upload platform" }).click();
    await page.getByRole("option", { name: gameSystems[system].label, exact: true }).click();
    const bytes = fixture();
    if (system !== "segacd") bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 1;
    else {
      const bios = discBios();
      bios[0x1000] = 1;
      await page.getByLabel("BIOS file", { exact: true }).setInputFiles({
        name: "own-bios.bin",
        mimeType: "application/octet-stream",
        buffer: bios,
      });
      await page.getByRole("button", { name: "Store BIOS", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "BIOS stored" })).toBeVisible();
    }
    await page.getByLabel("Game file", { exact: true }).setInputFiles({
      name: `fixture.${extension}`,
      mimeType: "application/octet-stream",
      buffer: Buffer.from(bytes),
    });
    await expect(page.getByLabel("Save files to synchronize")).toHaveCount(0);
    await page.getByRole("button", { name: "Publish to library", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published" })).toContainText(
      `Published ${title}`,
    );
    await page.getByRole("button", { name: "Back to library", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await page.getByLabel("Profile name").fill("Console upload acceptance");
    await page.getByRole("button", { name: "Create profile", exact: true }).click();
    await page.getByRole("button", { name: "Open profile", exact: true }).click();
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled({
      timeout: 30_000,
    });
    await expect(page.frameLocator("iframe").locator("canvas")).toBeVisible();
    await page.getByRole("button", { name: "Stop game", exact: true }).click();
    await expect(page.getByRole("button", { name: "Start game", exact: true })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Revision history" }).getByRole("link"),
    ).not.toHaveCount(0);
    const nativeUrl = await page
      .getByRole("link", { name: "save.srm", exact: true })
      .first()
      .getAttribute("href");
    if (!nativeUrl) throw new Error("Missing native save download");
    const download = await page.request.get(nativeUrl);
    expect(download.status()).toBe(200);
    const native = await download.body();
    expect(native[0]).toBe(system === "segacd" ? 0 : 0x42);
    if (system === "segacd") expect(native.length).toBe(73728);
    const stranger = await browser.newContext();
    try {
      await useSession(stranger, "other");
      expect((await stranger.request.get(new URL(nativeUrl, page.url()).href)).status()).toBe(404);
    } finally {
      await stranger.close();
    }
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Stop game", exact: true }).click();
    await expect(page.getByRole("button", { name: "Start game", exact: true })).toBeVisible();
    const resumedUrl = await page
      .getByRole("link", { name: "save.srm", exact: true })
      .first()
      .getAttribute("href");
    if (!resumedUrl) throw new Error("Missing resumed save download");
    const resumed = await page.request.get(resumedUrl);
    expect(resumed.status()).toBe(200);
    expect(await resumed.body()).toEqual(native);
  });
}

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
