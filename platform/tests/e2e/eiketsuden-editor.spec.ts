import { expect, test } from "@playwright/test";
import { zipSync } from "fflate";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { eiketsudenCompanion, eiketsudenFixture } from "../editors/eiketsuden-fixture.ts";
import { eiketsudenRulesFixture } from "../editors/eiketsuden-rules-fixture.ts";
import { checkEditorLayout } from "./editor-layout.ts";
import { chinese } from "./locales.ts";
import { useSession } from "./session.ts";

test("edits paired DOS saves with bounded bilingual drafts and read-only references", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await useSession(page.context(), `admin-eiketsuden-${info.retry}`);
  const upload = await page.request.post("/api/admin/games", {
    headers: { origin: "http://localhost:4317" },
    multipart: {
      metadata: JSON.stringify({
        title: "Eiketsuden editor test",
        system: "dos",
        executable: "PLAY.BAT",
        saveFiles: Array.from({ length: 5 }, (_, slot) => [
          `MSAVE${slot}.R3S`,
          `ESAVE${slot}.R3S`,
        ]).flat(),
      }),
      file: {
        name: "editor.zip",
        mimeType: "application/zip",
        buffer: Buffer.from(
          zipSync({
            "PLAY.BAT": Buffer.from("@echo off\r\necho Synthetic editor test\r\n"),
            "BAKDATA.R3": eiketsudenRulesFixture(),
          }),
        ),
      },
    },
  });
  expect(upload.status()).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  await page.getByLabel("Search published games").fill("Eiketsuden editor test");
  await page
    .getByRole("row")
    .filter({ hasText: "Eiketsuden editor test" })
    .getByRole("button", { name: "Edit configuration" })
    .click();
  await page.getByLabel("Save editor", { exact: true }).click();
  await page
    .getByRole("option", { name: "Sangokushi Eiketsuden (original DOS)", exact: true })
    .click();
  await page.getByRole("button", { name: "Save configuration", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toContainText(
    "Eiketsuden editor test",
  );
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await page.getByRole("button", { name: /Eiketsuden editor test/ }).click();
  await page.getByLabel("Profile name").fill("Original Eiketsuden editing");
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  const original = Buffer.from(eiketsudenFixture());
  original[1702] = 254; // Preserve an unknown item unless that slot is explicitly replaced.
  const files = [0, 4].flatMap((slot) => [
    { name: `MSAVE${slot}.R3S`, mimeType: "application/octet-stream", buffer: original },
    {
      name: `ESAVE${slot}.R3S`,
      mimeType: "application/octet-stream",
      buffer: Buffer.from(eiketsudenCompanion()),
    },
  ]);
  await page.getByLabel("Save files").setInputFiles(files);
  await page.getByRole("button", { name: "Upload save", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  const level = editor.getByLabel("Level", { exact: true });
  const experience = editor.getByLabel("Experience toward next level", { exact: true });
  await expect(level).toHaveValue("1");
  await expect(editor.locator(".record-table tbody tr")).toHaveCount(3);
  await expect(editor.getByRole("checkbox", { name: "Current party only" })).toBeChecked();
  for (const label of [
    "Stored troop count",
    "Base leadership",
    "Base strength",
    "Base intelligence",
  ])
    await expect(editor.getByLabel(label, { exact: true })).toBeDisabled();
  await expect(editor.getByLabel("Base strength", { exact: true })).toHaveValue("1");
  await expect(editor.getByRole("combobox", { name: "Item slot 8" })).toContainText("254");
  await level.fill("1000");
  await level.press("Tab");
  await expect(level).toHaveValue("99");
  await experience.fill("1000");
  await experience.press("Tab");
  await expect(experience).toHaveValue("99");
  await editor.getByRole("combobox", { name: "Troop class" }).click();
  await page.getByRole("option", { name: "Light cavalry", exact: true }).click();
  for (const [slot, item] of [
    [1, 7],
    [2, 31],
  ] as const) {
    await editor.getByRole("combobox", { name: `Item slot ${slot}`, exact: true }).click();
    await page.getByRole("option", { name: `Item ${item}`, exact: true }).click();
    await expect(page.getByRole("option", { name: `Item ${item}`, exact: true })).toHaveCount(0);
  }
  await page.getByRole("combobox", { name: "Language" }).selectOption("zh-CN");
  const translated = page.getByRole("region", { name: chinese("editor.title"), exact: true });
  await expect(translated.getByLabel(chinese("eiketsuden.level"), { exact: true })).toHaveValue(
    "99",
  );
  await expect(
    translated.getByRole("combobox", { name: chinese("eiketsuden.troopClass") }),
  ).toHaveText(chinese("eiketsuden.class.6"));
  await checkEditorLayout(translated, "equipment-zh");
  await page.getByRole("combobox", { name: chinese("app.language") }).selectOption("en");
  await editor.getByLabel("File to edit").click();
  await page.getByRole("option", { name: "MSAVE4.R3S", exact: true }).click();
  await expect(level).toHaveValue("1");
  await level.fill("44");
  await level.press("Tab");
  await editor.getByRole("checkbox", { name: "Current party only" }).uncheck();
  await editor.getByLabel("Search records").fill("C00383");
  await editor.getByRole("row").filter({ hasText: "C00383" }).click();
  await experience.fill("67");
  await experience.press("Tab");
  await editor.getByRole("button", { name: "Campaign", exact: true }).click();
  const money = editor.getByLabel("Money", { exact: true });
  await money.fill("10001");
  await money.press("Tab");
  await expect(money).toHaveValue("10000");
  await editor.getByLabel("File to edit").click();
  await page.getByRole("option", { name: "MSAVE0.R3S", exact: true }).click();
  await expect(money).toHaveValue("500");
  await money.fill("2000");
  await money.press("Tab");
  await editor.getByRole("button", { name: "Characters", exact: true }).click();
  await expect(level).toHaveValue("99");
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const preview = page.getByRole("dialog");
  for (const [file, moneyAfter] of [
    ["MSAVE0.R3S", "2000"],
    ["MSAVE4.R3S", "10000"],
  ] as const) {
    const moneyRow = preview
      .getByRole("row")
      .filter({ hasText: file })
      .filter({ hasText: "Money" });
    await expect(moneyRow.getByRole("cell", { name: moneyAfter, exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved as a new revision");
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  const profile = profiles.find(({ name }) => name === "Original Eiketsuden editing");
  const history: Revision[] = await (
    await page.request.get(`/api/profiles/${profile?.id}/revisions`)
  ).json();
  expect(history).toHaveLength(1);
  expect(history[0]?.source).toBe("editor");
  for (const file of files) {
    const expected = Buffer.from(file.buffer);
    if (file.name === "MSAVE0.R3S") {
      expected.writeUInt16LE(2000, 35);
      expected.set([6, 99, 99, 7, 31], 1692);
    }
    if (file.name === "MSAVE4.R3S") {
      expected.writeUInt16LE(10000, 35);
      expected[1693] = 44;
      expected[1685 + 383 * 18 + 9] = 67;
    }
    const response = await page.request.get(
      `/api/revisions/${history[0]?.id}/file?name=${file.name}`,
    );
    expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(expected);
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath("eiketsuden-editor.png"), animations: "disabled" });
});
