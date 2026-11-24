import { expect, test } from "@playwright/test";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("shows faction control and changes several computers to players", async ({ page }) => {
  test.setTimeout(90_000);
  const memory = san3GovernanceFixture();
  const { history } = await prepareSan3Editor(page, memory, "SAN3 control fixture", 0x60);
  await page.goto("/");
  await page.getByRole("button", { name: /SAN3 control fixture/ }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Factions", exact: true }).click();
  await expect(editor.getByRole("columnheader", { name: /Controlled by/ })).toBeVisible();
  await editor.getByLabel("Controlled by", { exact: true }).click();
  await page.getByRole("option", { name: "Player", exact: true }).click();
  await editor.getByLabel("Copy to records", { exact: true }).press("Space");
  await page.getByRole("option", { name: "Officer 7's faction", exact: true }).click();
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Copy changed fields", exact: true }).click();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.factionControl"), { exact: true })).toContainText(
    chinese("san3.factionControl1"),
  );
  await page.getByLabel(chinese("app.language")).selectOption("en");
  const original = (await history())[0];
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const saved = (await history())[0];
  const response = await page.request.get(
    `/api/revisions/${saved?.id}/file?name=__runtime%2Fstate.bin`,
  );
  expect(response.status()).toBe(200);
  const restored = openSnapshotMemory(
    new Uint8Array(await response.body()),
    "picodrive",
    "program",
  ).bytes;
  expect(restored.slice(0x7dc0a, 0x7dc0c)).toEqual(Uint8Array.of(1, 1));
  expect(restored.slice(0x7dbb2, 0x7dc0a)).toEqual(memory.slice(0x7dbb2, 0x7dc0a));
  expect(saved?.manifest.artifacts.find(({ name }) => name === "save.srm")).toEqual(
    original?.manifest.artifacts.find(({ name }) => name === "save.srm"),
  );
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
