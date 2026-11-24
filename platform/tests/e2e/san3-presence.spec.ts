import { expect, test } from "@playwright/test";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Lists } from "../../src/editors/san3/relocation.ts";
import { san3TreasureLayout } from "../../src/editors/san3/treasures.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("recruits and introduces officers through coherent service and discovery lists", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const program = san3GovernanceFixture();
  const data = new DataView(program.buffer);
  for (let index = 1; index < 13; index++)
    data.setUint16(san3TreasureLayout.owners + index * 2, 65535);
  for (const index of [2, 11]) data.setUint16(san3Layout.historical.offset + index * 30, 1);
  const { game, history } = await prepareSan3Editor(page, program, "SAN3 presence fixture");
  await page.goto("/");
  await page.getByRole("button", { name: game.title }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const capture = page.getByRole("button", { name: "Capture for editing", exact: true });
  await capture.click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await expect(editor.getByLabel("Service and discovery", { exact: true })).toBeDisabled();
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("Officer 3", { exact: true }) })
    .click();
  const before = (await history())[0];
  async function save() {
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
  await editor.getByLabel("Service and discovery", { exact: true }).click();
  await page.getByRole("option", { name: "Free officer", exact: true }).click();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const preview = page.getByRole("dialog");
  for (const label of ["Soldiers", "City strategist", "Loyalty"])
    await expect(preview).toContainText(label);
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  const resigned = await save();
  expect(resigned.officer(2)).toMatchObject({ role: 5, faction: 255, city: 0, soldiers: 0 });
  expect(inspectSan3Lists(resigned).cities[0]?.free).toEqual([2]);
  await capture.click();
  await expect(editor.getByLabel("Service and discovery", { exact: true })).toBeEnabled();
  await editor.getByLabel("Service and discovery", { exact: true }).click();
  await page.getByRole("option", { name: "Civil officer", exact: true }).click();
  const recruited = await save();
  expect(recruited.officer(2)).toMatchObject({ role: 4, faction: 0, soldiers: 0, loyalty: 100 });
  expect(inspectSan3Lists(recruited).cities[0]?.serving).toEqual([0, 1, 2]);
  await capture.click();
  await expect(editor.getByLabel("Service and discovery", { exact: true })).toBeEnabled();
  await editor.getByRole("checkbox", { name: "Active officers only", exact: true }).uncheck();
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("Officer 12", { exact: true }) })
    .click();
  await editor.getByLabel("Appearance city", { exact: true }).click();
  await page.getByRole("option", { name: "City 2", exact: true }).click();
  await editor.getByLabel("Service and discovery", { exact: true }).click();
  await page.getByRole("option", { name: "Undiscovered", exact: true }).click();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  await expect(preview).toContainText("Appearance city");
  await expect(preview).toContainText("City 2");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.appearanceCity"), { exact: true })).toContainText(
    chinese("san3.cityRecord").replace("{index}", "2"),
  );
  await page.getByLabel(chinese("app.language")).selectOption("en");
  const hidden = await save();
  expect(inspectSan3Lists(hidden).cities[1]?.hidden).toEqual([11]);
  await capture.click();
  await expect(editor.getByLabel("Service and discovery", { exact: true })).toBeEnabled();
  await editor.getByLabel("Service and discovery", { exact: true }).click();
  await page.getByRole("option", { name: "Free officer", exact: true }).click();
  const revealed = await save();
  expect(revealed.officer(11)).toMatchObject({ role: 5, faction: 255, city: 1, soldiers: 0 });
  expect(inspectSan3Lists(revealed).cities[1]).toMatchObject({ free: [11], hidden: [] });
  await capture.click();
  await expect(editor.getByLabel("Service and discovery", { exact: true })).toBeEnabled();
  await editor.getByLabel("Service and discovery", { exact: true }).click();
  await page.getByRole("option", { name: "Not yet appeared", exact: true }).click();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  await expect(preview).toContainText("City roster");
  await expect(preview).toContainText("Not yet appeared");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  const withdrawn = await save();
  expect(withdrawn.officer(11)).toMatchObject({ role: 7, faction: 255, city: 255, soldiers: 0 });
  expect(inspectSan3Lists(withdrawn).membership.has(11)).toBe(false);
  expect(withdrawn.read(withdrawn.offset("officers", 11) + 8, 1) & 16).toBe(0);
  await capture.click();
  await expect(editor.getByLabel("Appearance city", { exact: true })).toBeEnabled();
  await editor.getByLabel("Appearance city", { exact: true }).click();
  await page.getByRole("option", { name: "City 3", exact: true }).click();
  await editor.getByLabel("Service and discovery", { exact: true }).click();
  await page.getByRole("option", { name: "Civil officer", exact: true }).click();
  const returned = await save();
  expect(returned.officer(11)).toMatchObject({ role: 4, faction: 0, city: 2, soldiers: 0 });
  expect(inspectSan3Lists(returned).cities[2]?.serving).toEqual([8, 11]);
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
