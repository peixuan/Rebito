import { expect, test } from "@playwright/test";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("founds a computer faction with a persistent bilingual preview and atomic city ownership", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const memory = san3GovernanceFixture();
  const data = new DataView(memory.buffer);
  memory[0x7878b] = 2;
  data.setUint32(0x7dbb2, san3Layout.factions.offset);
  data.setUint32(0x7dbb6, san3Layout.factions.offset + 50);
  data.setUint32(0x7dc22, san3Layout.factions.offset);
  data.setUint32(0x7dc2a, san3Layout.cities.offset);
  const { history } = await prepareSan3Editor(page, memory, "SAN3 founding fixture", 0x68);
  await page.goto("/");
  await page.getByRole("button", { name: /SAN3 founding fixture/ }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Factions", exact: true }).click();
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("Faction 3", { exact: true }) })
    .click();
  await expect(editor.getByLabel("New faction control", { exact: true })).toBeDisabled();
  await editor.getByLabel("Found a faction here", { exact: true }).click();
  await page.getByRole("option", { name: "City 2 · Officer 4", exact: true }).click();
  await editor.getByLabel("New faction control", { exact: true }).click();
  await page.getByRole("option", { name: "Computer", exact: true }).click();
  for (let attempt = 0; attempt < 2; attempt++) {
    await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
    const preview = page.getByRole("dialog");
    for (const label of ["First turn", "Loyalty", "Factions in play", "Computer"])
      await expect(preview).toContainText(label);
    await preview.getByRole("button", { name: "Close", exact: true }).click();
    await expect(editor.getByLabel("New faction control", { exact: true })).toContainText(
      "Computer",
    );
  }
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.foundingControl"), { exact: true })).toContainText(
    chinese("san3.factionControl0"),
  );
  await page.getByLabel(chinese("app.language")).selectOption("en");
  const before = (await history())[0];
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  await expect(
    page.getByRole("status").filter({ hasText: "Changes were confirmed in the paused game" }),
  ).toBeVisible();
  const saved = (await history())[0];
  const response = await page.request.get(
    `/api/revisions/${saved?.id}/file?name=__runtime%2Fstate.bin`,
  );
  expect(response.status()).toBe(200);
  const document = new San3Document(
    openSnapshotMemory(new Uint8Array(await response.body()), "picodrive", "program").bytes,
  );
  expect(document.faction(2)).toMatchObject({ active: true, ruler: 3 });
  expect(inspectSan3Governance(document).factionCities.slice(0, 3)).toEqual([[0, 2], [3], [1]]);
  expect(document.read(0x7878b, 1)).toBe(3);
  expect(document.read(0x7dc0c, 1)).toBe(0);
  expect(document.officer(3)).toMatchObject({ role: 0, faction: 2, soldiers: 3000 });
  expect(document.copy().slice(0x7dbb2, 0x7dc0a)).toEqual(memory.slice(0x7dbb2, 0x7dc0a));
  expect(saved?.manifest.artifacts.find(({ name }) => name === "save.srm")).toEqual(
    before?.manifest.artifacts.find(({ name }) => name === "save.srm"),
  );
  await expect(editor.getByLabel("Found a faction here", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
