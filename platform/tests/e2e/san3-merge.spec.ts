import { expect, test } from "@playwright/test";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { startSan3Session } from "./san3-session.ts";

test("absorbs a faction with canonical contracts and a bilingual draft", async ({ page }) => {
  test.setTimeout(90_000);
  const program = san3GovernanceFixture();
  const data = new DataView(program.buffer);
  program[0x7878b] = 2;
  data.setUint32(0x7dc22, san3Layout.factions.offset);
  data.setUint32(0x7dc2a, san3Layout.cities.offset);
  for (let faction = 0; faction < 21; faction++)
    for (const relative of [14, 36, 37, 42])
      program[san3Layout.factions.offset + faction * 50 + relative] = 255;
  data.setUint32(san3Layout.factions.offset + 6, 2);
  program[san3Layout.factions.offset + 36] = 1;
  const { history } = await startSan3Session(page, program, "SAN3 merger fixture");
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Factions", exact: true }).click();
  await expect(editor.getByLabel("Merge this faction into", { exact: true })).toBeDisabled();
  await editor.getByRole("row").filter({ hasText: "Officer 7's faction" }).click();
  await editor.getByLabel("Merge this faction into", { exact: true }).click();
  await page.getByRole("option", { name: "Officer 1's faction", exact: true }).click();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const preview = page.getByRole("dialog");
  for (const label of ["Alliance cancelled", "Joint-attack agreement cancelled", "Delegation mode"])
    await expect(preview).toContainText(label);
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.mergeFaction"), { exact: true })).toContainText(
    chinese("san3.factionOf").replace(
      "{ruler}",
      chinese("san3.officerRecord").replace("{index}", "1"),
    ),
  );
  await page.getByLabel(chinese("app.language")).selectOption("en");
  const before = (await history())[0];
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  await expect(
    page.getByRole("status").filter({ hasText: "Changes were confirmed in the paused game" }),
  ).toBeVisible();
  const saved = (await history())[0];
  expect(saved?.manifest.artifacts.find(({ name }) => name === "save.srm")).toEqual(
    before?.manifest.artifacts.find(({ name }) => name === "save.srm"),
  );
  const response = await page.request.get(
    `/api/revisions/${saved?.id}/file?name=__runtime%2Fstate.bin`,
  );
  expect(response.status()).toBe(200);
  const document = new San3Document(
    openSnapshotMemory(new Uint8Array(await response.body()), "picodrive", "program").bytes,
  );
  expect(document.faction(1).active).toBe(false);
  expect(inspectSan3Governance(document).factionCities[0]).toEqual([0, 1, 2, 3]);
  expect(document.officer(6)).toMatchObject({ role: 3, faction: 0, soldiers: 3000 });
  expect(document.read(san3Layout.factions.offset + 6, 4)).toBe(0);
  expect(document.read(san3Layout.factions.offset + 36, 1)).toBe(255);
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
