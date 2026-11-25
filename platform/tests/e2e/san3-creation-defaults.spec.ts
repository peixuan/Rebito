import { expect, test } from "@playwright/test";
import { san3Layout } from "../../src/editors/san3/document.ts";
import { San3PresetDocument, san3PresetLayout } from "../../src/editors/san3/presets.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("switches to registration and writes bilingual creation defaults into the running core", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { game, history, publishMemory } = await prepareSan3Editor(
    page,
    san3GovernanceFixture(),
    "SAN3 creation defaults fixture",
  );
  await page.goto("/");
  await page.getByRole("button", { name: game.title }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const capture = page.getByRole("button", { name: "Capture for editing", exact: true });
  await capture.click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByRole("button", { name: "Cities", exact: true })).toBeVisible();
  const original = (await history())[0];
  if (!original) throw new Error("Missing editing base");

  // The same editor selects its registration schema from captured RAM, not a client flag.
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start game", exact: true })).toBeEnabled();
  const setup = new Uint8Array(san3Layout.size);
  const setupView = new DataView(setup.buffer);
  setupView.setUint16(0x4abc4, 4);
  for (const offset of [0x58a04, 0x58d6a]) {
    setupView.setUint16(offset, 0x207c);
    setupView.setUint32(offset + 2, san3PresetLayout.offset);
  }
  for (const [offset, value] of [
    [0x58a5e, 0x745a],
    [0x58a62, 0x7446],
    [0x58d1a, 0x0c32],
    [0x58d1c, 100],
    [0x58d0e, 0x4a04],
    [0x58d10, 0x6700],
    [0x58d12, 0xff38],
    [0x58e02, 0x4a04],
    [0x58e04, 0x6600],
    [0x58e06, 0xfe44],
  ] as const)
    setupView.setUint16(offset, value);
  setup.fill(50, san3PresetLayout.offset, san3PresetLayout.offset + 24);
  await publishMemory(setup);
  await page.getByRole("button", { name: "Refresh saves", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await capture.click();
  await expect(
    editor.getByRole("button", { name: "New officer creation defaults", exact: true }),
  ).toBeVisible();
  await expect(editor.getByRole("button", { name: "Cities", exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Cities", exact: true })).toBeDisabled();
  await expect(editor).toContainText("Capture again at the strategic map.");
  await expect(editor).toContainText("Temporary creation defaults, not native-save data.");
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(
    page.getByRole("region", { name: chinese("editor.title"), exact: true }),
  ).toContainText(chinese("san3.presetHelp"));
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor.getByLabel("Strength", { exact: true }).fill("73");
  await editor.getByLabel("Strength", { exact: true }).press("Tab");
  await editor.getByLabel("Copy to records", { exact: true }).press("Space");
  await page.getByRole("option", { name: "Female, under 30", exact: true }).click();
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Copy changed fields", exact: true }).click();
  await editor.getByRole("row").filter({ hasText: "Female, 30 or older" }).click();
  await editor.getByLabel("Charisma", { exact: true }).fill("81");
  await editor.getByLabel("Charisma", { exact: true }).press("Tab");
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.charisma"), { exact: true })).toHaveValue("81");
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const setupSaved = (await history())[0];
  const setupResponse = await page.request.get(
    `/api/revisions/${setupSaved?.id}/file?name=__runtime%2Fstate.bin`,
  );
  const restoredSetup = new San3PresetDocument(
    openSnapshotMemory(new Uint8Array(await setupResponse.body()), "picodrive", "program").bytes,
  );
  expect(restoredSetup.values(0)[2]).toBe(73);
  expect(restoredSetup.values(1)[2]).toBe(73);
  expect(restoredSetup.values(3)[5]).toBe(81);
  expect(setupSaved?.manifest.artifacts.find((file) => file.name === "save.srm")).toEqual(
    original.manifest.artifacts.find((file) => file.name === "save.srm"),
  );
  await capture.click();
  await editor
    .getByRole("button", { name: "Set all creation defaults to 100", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Points to allocate");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.charisma"), { exact: true })).toHaveValue("100");
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const maximumSaved = (await history())[0];
  const maximumResponse = await page.request.get(
    `/api/revisions/${maximumSaved?.id}/file?name=__runtime%2Fstate.bin`,
  );
  expect(maximumResponse.status()).toBe(200);
  const maximumBytes = openSnapshotMemory(
    new Uint8Array(await maximumResponse.body()),
    "picodrive",
    "program",
  ).bytes;
  const maximumSetup = new San3PresetDocument(maximumBytes);
  for (let index = 0; index < 4; index++) {
    expect(maximumSetup.values(index)).toEqual(Array(6).fill(100));
    expect(maximumSetup.bonus(index)).toBe(0);
  }
  const maximumCode = new DataView(maximumBytes.buffer);
  expect(maximumCode.getUint16(0x58a5e)).toBe(0x7400);
  expect(maximumCode.getUint16(0x58a62)).toBe(0x7400);
  expect(maximumCode.getUint16(0x58d12)).toBe(0xf0);
  expect(maximumSaved?.manifest.artifacts.find((file) => file.name === "save.srm")).toEqual(
    original.manifest.artifacts.find((file) => file.name === "save.srm"),
  );
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start game", exact: true })).toBeEnabled();
  await expect(editor.getByRole("alert")).not.toBeVisible();
  expect(errors).toEqual([]);
});
