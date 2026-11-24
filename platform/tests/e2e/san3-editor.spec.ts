import { expect, test } from "@playwright/test";
import { San3BattleDocument } from "../../src/editors/san3/battle.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { San3PresetDocument, san3PresetLayout } from "../../src/editors/san3/presets.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3BattleFixture } from "../editors/san3-battle-fixture.ts";
import { san3NameFixture } from "../editors/san3-name-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

/** Synthetic strategic records only; the original fixture firmware never executes game commands. */
function strategicMemory() {
  const bytes = san3NameFixture(
    Array.from({ length: 68 }, (_, index) => chinese(`san3.presetName${index}`)),
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0x78000, 0x4b4f4549);
  view.setUint32(0x78776, 0x4b4f4549);
  view.setUint16(0x78788, 200);
  for (let index = 1; index < 13; index++) view.setUint16(0x787aa + index * 2, 0xffff);
  for (let index = 0; index < san3Layout.factions.count; index++)
    view.setUint16(san3Layout.factions.offset + index * san3Layout.factions.stride, 0xffff);
  view.setUint16(san3Layout.factions.offset, 0);
  view.setUint32(san3Layout.factions.offset + 2, san3Layout.cities.offset);
  for (let index = 0; index < san3Layout.custom.count; index++) {
    const offset = san3Layout.custom.offset + index * san3Layout.custom.stride;
    view.setUint16(offset, 0xffff);
    bytes.set([50, 50, 50, 50, 50, 50, 1, 1, 20], offset + 4);
  }
  view.setUint16(san3Layout.custom.offset + 28, 231);
  bytes.set(new TextEncoder().encode("Custom"), san3Layout.custom.offset + 28 + 13);
  for (let index = 0; index < 311; index++) view.setUint16(0x478f0 + index * 2, 0x8000 + index);
  for (let index = 0; index < san3Layout.cities.count; index++) {
    const offset = san3Layout.cities.offset + index * san3Layout.cities.stride;
    for (const relative of [4, 6, 8, 10]) view.setUint16(offset + relative, 0xffff);
    bytes[offset + 0x14] = index === 0 ? 0 : 0xff;
    view.setUint16(offset + 0x0c, 700);
    view.setUint16(offset + 0x0e, 1500);
    view.setUint32(offset + 0x10, 25_000);
  }
  for (let index = 0; index < san3Layout.officers.count; index++) {
    bytes[san3Layout.officers.offset + index * san3Layout.officers.stride + 0x0c] = 7;
    view.setUint16(san3Layout.officers.offset + index * san3Layout.officers.stride, 0xffff);
  }
  view.setUint16(san3Layout.cities.offset + 4, 0);
  view.setUint16(san3Layout.officers.offset, 1);
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

test("edits bilingual Mega-CD strategic drafts and verifies the running PicoDrive checkpoint", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const memory = strategicMemory();
  const { history, publishMemory } = await prepareSan3Editor(page, memory);

  await page.goto("/");
  await page.getByRole("button", { name: /SAN3 strategic editor fixture/ }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const capture = page.getByRole("button", { name: "Capture for editing", exact: true });
  await expect(capture).toBeEnabled({ timeout: 30_000 });
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeDisabled();
  await expect(editor).toContainText("Capture the paused game again before editing");
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
  await editor.getByLabel("Copy to records", { exact: true }).press("Space");
  await page.getByRole("option", { name: "City 2", exact: true }).click();
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Copy changed fields", exact: true }).click();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await expect(editor.getByLabel("Loyalty", { exact: true })).toBeDisabled();
  await editor.getByRole("row").filter({ hasText: "General" }).click();
  for (const [label, value] of [
    ["Soldiers", "8765"],
    ["Loyalty", "89"],
    ["Training", "67"],
    ["Morale", "78"],
  ]) {
    if (!label || !value) throw new Error("Missing officer edit");
    await editor.getByLabel(label, { exact: true }).fill(value);
    await editor.getByLabel(label, { exact: true }).press("Tab");
  }
  const abilities = [
    ["Land leadership", "91"],
    ["Naval leadership", "92"],
    ["Strength", "93"],
    ["Intelligence", "94"],
    ["Politics", "95"],
    ["Charisma", "96"],
  ] as const;
  for (const [label] of abilities)
    await expect(editor.getByLabel(label, { exact: true })).toBeDisabled();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(
    page
      .getByRole("region", { name: chinese("editor.title"), exact: true })
      .getByLabel(chinese("san3.soldiers"), { exact: true }),
  ).toHaveValue("8765");
  await expect(page.getByLabel(chinese("san3.strength"), { exact: true })).toHaveValue("80");
  await expect(page.getByLabel(chinese("san3.strength"), { exact: true })).toBeDisabled();
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor.getByRole("button", { name: "Custom officers", exact: true }).click();
  await expect(editor.getByLabel("Portrait", { exact: true })).toBeDisabled();
  await editor
    .getByRole("row")
    .filter({ hasText: /^Custom/ })
    .click();
  for (const [label, value] of abilities) {
    await editor.getByLabel(label, { exact: true }).fill(value);
    await editor.getByLabel(label, { exact: true }).press("Tab");
  }
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.strength"), { exact: true })).toHaveValue("93");
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor
    .getByRole("row")
    .filter({ hasText: /^Officer 533/ })
    .click();
  await editor.getByRole("button", { name: "Preview 68 preset names", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue(chinese("san3.presetName0"));
  await editor.getByLabel("Age", { exact: true }).fill("35");
  await editor.getByLabel("Age", { exact: true }).press("Tab");
  await editor.getByLabel("Birth month", { exact: true }).fill("2");
  await editor.getByLabel("Birth month", { exact: true }).press("Tab");
  await editor.getByLabel("Birth day", { exact: true }).fill("29");
  await editor.getByLabel("Birth day", { exact: true }).press("Tab");
  await editor.getByLabel("Name", { exact: true }).fill("\u6f22\u5b57");
  await editor.getByLabel("Reading", { exact: true }).fill("\u304c\u3071");
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.kanji"), { exact: true })).toHaveValue("\u6f22\u5b57");
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
  await editor.getByRole("button", { name: "Custom officers", exact: true }).click();
  await expect(editor.getByLabel("Birth month", { exact: true })).toBeDisabled();
  await expect(
    editor.getByRole("button", { name: "Preview 68 preset names", exact: true }),
  ).toBeDisabled();
  await expect(
    editor.getByRole("button", { name: "Discard draft and reload", exact: true }),
  ).toBeEnabled();
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
  expect(document.city(1)).toMatchObject({ population: 123_400, gold: 12_345, food: 234_567 });
  expect(document.officer(1)).toMatchObject({
    soldiers: 8765,
    loyalty: 89,
    training: 67,
    morale: 78,
  });
  expect(Object.values(document.attributes(1))).toEqual([70, 60, 80, 90, 50, 40]);
  expect(document.officer(1).soldierLimit).toBe(17_000);
  expect(Object.values(document.attributes(533))).toEqual([91, 92, 93, 94, 95, 96]);
  expect(document.officer(533).soldierLimit).toBe(19_200);
  expect(document.read(san3Layout.custom.offset + 28, 2)).toBe(231);
  const { offset, count, stride } = san3Layout.historical;
  expect(result.subarray(offset, offset + count * stride)).toEqual(
    memory.subarray(offset, offset + count * stride),
  );
  expect(result[123]).toBe(219);
  expect([
    ...result.subarray(san3Layout.custom.offset + 10, san3Layout.custom.offset + 13),
  ]).toEqual([2, 29, 35]);
  expect(new DataView(result.buffer).getUint16(san3Layout.custom.offset)).toBe(0xffff);
  expect(document.officer(532).name).toBe("\u6f22\u5b57");
  expect(document.officer(599).name).toBe(chinese("san3.presetName67"));
  expect([
    ...result.subarray(san3Layout.custom.offset + 20, san3Layout.custom.offset + 25),
  ]).toEqual([0xb6, 0xde, 0xca, 0xdf, 0]);

  await capture.click();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await editor
    .getByRole("row")
    .filter({ hasText: /^General/ })
    .click();
  await editor.getByLabel("Role", { exact: true }).click();
  await page.getByRole("option", { name: "Strategist", exact: true }).click();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Strategist");
  await expect(page.getByRole("dialog")).toContainText("City strategist");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await editor.getByRole("button", { name: "Cities", exact: true }).click();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await expect(editor.getByLabel("Role", { exact: true })).toContainText("Strategist");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const appointedRevision = (await history())[0];
  const appointedResponse = await page.request.get(
    `/api/revisions/${appointedRevision?.id}/file?name=__runtime%2Fstate.bin`,
  );
  const appointedDocument = new San3Document(
    openSnapshotMemory(new Uint8Array(await appointedResponse.body()), "picodrive", "program")
      .bytes,
  );
  expect(appointedDocument.officer(1).role).toBe(1);
  expect(appointedDocument.read(san3Layout.cities.offset + 10, 2)).toBe(1);

  await capture.click();
  await editor.getByRole("button", { name: "Factions", exact: true }).click();
  await editor.getByLabel("New ruler", { exact: true }).click();
  await page.getByRole("option", { name: "General", exact: true }).click();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("New ruler");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  // Core load acknowledgement may normalize state; a new workflow needs a fresh capture.
  await editor.getByRole("button", { name: "Factions", exact: true }).click();
  await expect(editor.getByLabel("New ruler", { exact: true })).toBeDisabled();
  await capture.click();
  await editor.getByRole("button", { name: "Factions", exact: true }).click();
  await expect(editor.getByLabel("New ruler", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await editor
    .getByRole("row")
    .filter({ hasText: /^Ruler/ })
    .click();
  await editor.getByLabel("Move to city", { exact: true }).click();
  await page.getByRole("option", { name: "City 2", exact: true }).click();
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const relocated = (await history())[0];
  const relocatedResponse = await page.request.get(
    `/api/revisions/${relocated?.id}/file?name=__runtime%2Fstate.bin`,
  );
  const relocatedMemory = new San3Document(
    openSnapshotMemory(new Uint8Array(await relocatedResponse.body()), "picodrive", "program")
      .bytes,
  );
  expect(relocatedMemory.faction(0).ruler).toBe(1);
  expect(relocatedMemory.officer(0)).toMatchObject({
    city: 1,
    faction: 255,
    role: 5,
    soldiers: 0,
    training: 0,
    morale: 0,
  });
  expect(relocated?.manifest.artifacts.find((file) => file.name === "save.srm")).toEqual(
    original.manifest.artifacts.find((file) => file.name === "save.srm"),
  );

  await capture.click();
  await editor.getByRole("button", { name: "Treasures", exact: true }).click();
  await editor
    .getByRole("row")
    .filter({ hasText: /^Treasure 2/ })
    .click();
  await editor.getByLabel("Owner", { exact: true }).click();
  await page.getByRole("option", { name: "General", exact: true }).click();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await editor
    .getByRole("row")
    .filter({ hasText: /^General/ })
    .click();
  await editor.getByLabel("Strategy books held", { exact: true }).fill("2");
  await editor.getByLabel("Strategy books held", { exact: true }).press("Tab");
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Treasure 2");
  await expect(page.getByRole("dialog")).toContainText("Strategy books held");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const treasureRevision = (await history())[0];
  const treasureResponse = await page.request.get(
    `/api/revisions/${treasureRevision?.id}/file?name=__runtime%2Fstate.bin`,
  );
  const treasureData = new DataView(
    openSnapshotMemory(new Uint8Array(await treasureResponse.body()), "picodrive", "program").bytes
      .buffer,
  );
  expect(treasureData.getUint16(0x787aa)).toBe(2);
  expect(treasureData.getUint16(0x787ac)).toBe(1);
  expect(treasureData.getUint16(san3Layout.officers.offset + 30 + 4)).toBe(0x4003);
  expect(treasureRevision?.manifest.artifacts.find((file) => file.name === "save.srm")).toEqual(
    original.manifest.artifacts.find((file) => file.name === "save.srm"),
  );

  await capture.click();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await editor
    .getByRole("row")
    .filter({ hasText: /^General/ })
    .click();
  await editor.getByLabel("Turncoat months remaining", { exact: true }).fill("3");
  await editor.getByLabel("Turncoat months remaining", { exact: true }).press("Tab");
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Turncoat months remaining");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await editor.getByRole("button", { name: "Cities", exact: true }).click();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await expect(editor.getByLabel("Turncoat months remaining", { exact: true })).toHaveValue("3");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const lifecycleRevision = (await history())[0];
  const lifecycleResponse = await page.request.get(
    `/api/revisions/${lifecycleRevision?.id}/file?name=__runtime%2Fstate.bin`,
  );
  const lifecycleMemory = openSnapshotMemory(
    new Uint8Array(await lifecycleResponse.body()),
    "picodrive",
    "program",
  ).bytes;
  expect((lifecycleMemory[san3Layout.officers.offset + 30 + 9] ?? 0) & 0x30).toBe(0x30);

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
  await expect(editor.getByRole("button", { name: "Cities", exact: true })).toHaveCount(0);
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
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start game", exact: true })).toBeEnabled();
  await publishMemory(san3BattleFixture());
  await page.getByRole("button", { name: "Refresh saves", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Battle", exact: true })).toBeVisible();
  await expect(editor).toContainText("native-save persistence has not been verified.");
  await expect(editor).toContainText("An unfinished command may overwrite changes.");
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await capture.click();
  await editor.getByLabel("Remaining mobility", { exact: true }).fill("90");
  await editor.getByLabel("Remaining mobility", { exact: true }).press("Tab");
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.mobility"), { exact: true })).toHaveValue("90");
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Remaining mobility");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const battleRevision = (await history())[0];
  const battleResponse = await page.request.get(
    `/api/revisions/${battleRevision?.id}/file?name=__runtime%2Fstate.bin`,
  );
  const battle = new San3BattleDocument(
    openSnapshotMemory(new Uint8Array(await battleResponse.body()), "picodrive", "program").bytes,
  );
  expect(battle.officer(0).mobility).toBe(90);
  expect(battleRevision?.manifest.artifacts.find((file) => file.name === "save.srm")).toEqual(
    original.manifest.artifacts.find((file) => file.name === "save.srm"),
  );
  await expect(editor.getByRole("alert")).not.toBeVisible();
  expect(errors).toEqual([]);
});
