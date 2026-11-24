import { expect, test } from "@playwright/test";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3AppearanceFixture } from "../editors/san3-appearance-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("registers a filled custom officer and schedules appearances with canonical paused edits", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const program = san3AppearanceFixture();
  const definition = san3Layout.custom.offset + 10 * 28;
  program.set([255, 1, 60, 60, 60, 60, 60, 60, 1, 1, 20], definition + 2);
  const officer = san3Layout.officers.offset + 542 * 30;
  program.fill(0, officer, officer + 30);
  program[officer + 12] = 255;
  const { game, history } = await prepareSan3Editor(page, program, "SAN3 custom placement fixture");
  await page.goto("/");
  await page.getByRole("button", { name: game.title }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const capture = page.getByRole("button", { name: "Capture for editing", exact: true });
  await capture.click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Custom officers", exact: true }).click();
  await editor
    .getByRole("row")
    .filter({ hasText: /^Officer 543/ })
    .click();
  await expect(editor.getByLabel("Service and discovery", { exact: true })).toBeDisabled();
  await editor.getByLabel("Name", { exact: true }).fill("\u6f22");
  await editor.getByLabel("Reading", { exact: true }).fill("\u3042");
  await editor.getByLabel("Intelligence", { exact: true }).fill("93");
  await editor.getByLabel("Intelligence", { exact: true }).press("Tab");
  const preview = page.getByRole("dialog");
  async function inspectPreview() {
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith("/editor/preview") && response.request().method() === "POST",
    );
    await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
    const result = await response;
    expect(result.status()).toBe(200);
    return result.json();
  }
  await inspectPreview();
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await expect(editor.getByLabel("Service and discovery", { exact: true })).toBeEnabled();
  await editor.getByLabel("Appearance city", { exact: true }).click();
  await page.getByRole("option", { name: "City 2", exact: true }).click();
  await editor.getByLabel("Service and discovery", { exact: true }).click();
  await page.getByRole("option", { name: "Civil officer", exact: true }).click();
  const request = await inspectPreview();
  expect(request.changes).toEqual({
    "officer.542.intelligence": 93,
    "presence.542.role": 4,
    "presence.542.city": 1,
  });
  expect(request.textChanges).toEqual({ "custom.10.kanji": "\u6f22", "custom.10.kana": "\u3042" });
  for (const label of ["Portrait", "Unregistered", "277", "Civil officer", "City 2"])
    await expect(preview).toContainText(label);
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await editor.getByRole("button", { name: "Cities", exact: true }).click();
  await editor.getByRole("button", { name: "Custom officers", exact: true }).click();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.kanji"), { exact: true })).toHaveValue("\u6f22");
  await expect(page.getByLabel(chinese("san3.presenceRole"), { exact: true })).toContainText(
    chinese("san3.role4"),
  );
  await page.getByLabel(chinese("app.language")).selectOption("en");
  async function save() {
    const before = (await history())[0];
    await editor.getByRole("button", { name: "Save edits", exact: true }).click();
    await expect(editor.getByRole("status")).toContainText("Edits were saved");
    await expect(
      page.getByRole("status").filter({ hasText: "Changes were confirmed in the paused game" }),
    ).toBeVisible();
    const revision = (await history())[0];
    expect(revision?.manifest.artifacts.find(({ name }) => name === "save.srm")).toEqual(
      before?.manifest.artifacts.find(({ name }) => name === "save.srm"),
    );
    const response = await page.request.get(
      `/api/revisions/${revision?.id}/file?name=__runtime%2Fstate.bin`,
    );
    expect(response.status()).toBe(200);
    return new San3Document(
      openSnapshotMemory(new Uint8Array(await response.body()), "picodrive", "program").bytes,
    );
  }
  const registered = await save();
  expect(registered.officer(542)).toMatchObject({
    name: "\u6f22",
    role: 4,
    city: 1,
    faction: 0,
    loyalty: 100,
  });
  expect(registered.read(definition, 2)).toBe(277);
  expect(registered.attributes(542).intelligence).toBe(93);
  expect(inspectSan3Governance(registered).cities[1]?.serving).toEqual([3, 4, 5, 542]);
  await capture.click();
  await expect(editor.getByLabel("Name", { exact: true })).toBeEnabled();
  await editor
    .getByRole("row")
    .filter({ hasText: /^Officer 542/ })
    .click();
  await editor.getByLabel("Appearance year", { exact: true }).click();
  await page.getByRole("option", { name: "191", exact: true }).click();
  expect((await inspectPreview()).changes).toEqual({ "appearance.541.year": 191 });
  await expect(preview).toContainText("Scenario year offset");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await editor.getByRole("button", { name: "Cities", exact: true }).click();
  await editor.getByRole("button", { name: "Custom officers", exact: true }).click();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.appearanceYear"), { exact: true })).toContainText(
    "191",
  );
  await page.getByLabel(chinese("app.language")).selectOption("en");
  const scheduled = await save();
  expect(scheduled.read(san3Layout.custom.offset + 9 * 28 + 2, 1)).toBe(3);
  expect(scheduled.officer(541)).toMatchObject({ role: 255, city: 255, faction: 255 });
  expect(scheduled.copy().slice(definition, definition + 28)).toEqual(
    registered.copy().slice(definition, definition + 28),
  );
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
