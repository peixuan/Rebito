import { expect, test } from "@playwright/test";
import { san3TreasureLayout } from "../../src/editors/san3/treasures.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import {
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("copies personal treasures and seven books without changing global ownership", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const program = san3GovernanceFixture();
  const data = new DataView(program.buffer);
  data.setUint16(san3TreasureLayout.owners, 5);
  for (let item = 1; item < 13; item++)
    data.setUint16(san3TreasureLayout.owners + item * 2, item === 4 ? 6 : 65535);
  data.setUint16(officer(6) + 4, 1 << 4);
  const { history } = await prepareSan3Editor(page, program, "SAN3 personal treasure fixture");
  await page.goto("/");
  await page.getByRole("button", { name: /SAN3 personal treasure fixture/ }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await editor.getByLabel("Strategy books held", { exact: true }).fill("7");
  await editor.getByLabel("Strategy books held", { exact: true }).press("Tab");
  await editor.getByRole("checkbox", { name: "Treasure 5", exact: true }).check();
  await editor.getByLabel("Copy to records", { exact: true }).press("Space");
  await page.getByRole("option", { name: "Officer 2", exact: true }).click();
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Copy changed fields", exact: true }).click();
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("Officer 2", { exact: true }) })
    .click();
  await expect(editor.getByLabel("Strategy books held", { exact: true })).toHaveValue("7");
  await expect(editor.getByRole("checkbox", { name: "Treasure 5", exact: true })).toBeChecked();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.bookCopies"), { exact: true })).toHaveValue("7");
  await expect(
    page.getByRole("checkbox", {
      name: chinese("san3.treasureRecord").replace("{index}", "5"),
      exact: true,
    }),
  ).toBeChecked();
  await page.getByLabel(chinese("app.language")).selectOption("en");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/editor/preview") && response.request().method() === "POST",
  );
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const previewResponse = await responsePromise;
  expect(previewResponse.status()).toBe(200);
  expect((await previewResponse.json()).changes).toEqual({
    "book.0.copies": 7,
    "book.1.copies": 7,
    "personalTreasure.0.4": 1,
    "personalTreasure.1.4": 1,
  });
  const preview = page.getByRole("dialog");
  for (const label of ["Officer 1", "Officer 2", "Strategy books held", "Treasure 5"])
    await expect(preview).toContainText(label);
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  const before = (await history())[0];
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  await expect(
    page.getByRole("status").filter({
      hasText: "Changes were confirmed in the paused game",
    }),
  ).toBeVisible();
  const revision = (await history())[0];
  expect(revision?.manifest.artifacts.find(({ name }) => name === "save.srm")).toEqual(
    before?.manifest.artifacts.find(({ name }) => name === "save.srm"),
  );
  const response = await page.request.get(
    `/api/revisions/${revision?.id}/file?name=__runtime%2Fstate.bin`,
  );
  expect(response.status()).toBe(200);
  const saved = openSnapshotMemory(
    new Uint8Array(await response.body()),
    "picodrive",
    "program",
  ).bytes;
  const restored = new DataView(saved.buffer);
  for (const index of [0, 1]) expect(restored.getUint16(officer(index) + 4)).toBe(0xe011);
  expect(restored.getUint16(officer(6) + 4)).toBe(1 << 4);
  expect(saved.slice(san3TreasureLayout.owners, san3TreasureLayout.owners + 26)).toEqual(
    program.slice(san3TreasureLayout.owners, san3TreasureLayout.owners + 26),
  );
  for (const index of [0, 1]) restored.setUint16(officer(index) + 4, 0);
  expect(saved).toEqual(program);
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
