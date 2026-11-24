import { expect, test } from "@playwright/test";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Lists } from "../../src/editors/san3/relocation.ts";
import { san3TreasureLayout } from "../../src/editors/san3/treasures.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { governanceOfficer, san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("retires an officer with inheritance and revives in the chosen city", async ({ page }) => {
  test.setTimeout(120_000);
  const program = san3GovernanceFixture();
  const data = new DataView(program.buffer);
  for (let index = 1; index < 13; index++)
    data.setUint16(san3TreasureLayout.owners + index * 2, 65535);
  data.setUint16(san3Layout.historical.offset + 2 * 30, 1);
  data.setUint16(san3TreasureLayout.owners + 2, 2);
  data.setUint16(governanceOfficer(2) + 4, 2);
  const { history } = await prepareSan3Editor(page, program, "SAN3 life fixture");
  await page.goto("/");
  await page.getByRole("button", { name: /SAN3 life fixture/ }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const capture = page.getByRole("button", { name: "Capture for editing", exact: true });
  await capture.click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await expect(editor.getByRole("checkbox", { name: "Deceased", exact: true })).toBeDisabled();
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("Officer 3", { exact: true }) })
    .click();
  const before = (await history())[0];
  async function memory() {
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
  await editor.getByRole("checkbox", { name: "Deceased", exact: true }).check();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const preview = page.getByRole("dialog");
  for (const label of ["Soldiers", "Belongings recipient", "City strategist"])
    await expect(preview).toContainText(label);
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  await expect(
    page.getByRole("status").filter({ hasText: "Changes were confirmed in the paused game" }),
  ).toBeVisible();
  const retired = await memory();
  expect(retired.read(governanceOfficer(2) + 8, 1) & 16).toBe(16);
  expect(inspectSan3Lists(retired).membership.has(2)).toBe(false);
  expect(retired.read(san3TreasureLayout.owners + 2, 2)).toBe(0);
  await capture.click();
  await expect(editor.getByLabel("Revival city", { exact: true })).toBeEnabled();
  await editor.getByLabel("Revival city", { exact: true }).click();
  await page.getByRole("option", { name: "City 5", exact: true }).click();
  await editor.getByRole("checkbox", { name: "Deceased", exact: true }).uncheck();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  await expect(preview).toContainText("Retired army record");
  await expect(preview).toContainText("City 5");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.revivalCity"), { exact: true })).toContainText(
    chinese("san3.cityRecord").replace("{index}", "5"),
  );
  await expect(
    page.getByRole("checkbox", { name: chinese("san3.dead"), exact: true }),
  ).not.toBeChecked();
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  await expect(
    page.getByRole("status").filter({ hasText: "Changes were confirmed in the paused game" }),
  ).toBeVisible();
  const revived = await memory();
  expect(revived.officer(2)).toMatchObject({
    city: 4,
    faction: 255,
    role: 5,
    soldiers: 0,
    training: 0,
    morale: 0,
  });
  expect(inspectSan3Lists(revived).cities[4]?.free).toEqual([2, 9]);
  expect(revived.read(governanceOfficer(2) + 8, 1) & 16).toBe(0);
  expect(revived.read(san3TreasureLayout.owners + 2, 2)).toBe(0);
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
