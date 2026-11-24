import { expect, test } from "@playwright/test";
import { San3Document } from "../../src/editors/san3/document.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("previews governor side effects and writes leadership into the paused core", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { history } = await prepareSan3Editor(
    page,
    san3GovernanceFixture(),
    "SAN3 governance fixture",
    0x5b,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /SAN3 governance fixture/ }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("City 2", { exact: true }) })
    .click();
  const original = (await history())[0];
  await editor.getByLabel("New governor", { exact: true }).click();
  await page.getByRole("option", { name: "Officer 5", exact: true }).click();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const preview = page.getByRole("dialog");
  await expect(preview).toContainText("Former governor's role");
  await expect(preview).toContainText("City strategist");
  await expect(preview).toContainText("Military officer");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.appointGovernor"), { exact: true })).toContainText(
    chinese("san3.officerRecord").replace("{index}", "5"),
  );
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await editor.getByRole("button", { name: "Cities", exact: true }).click();
  await expect(editor.getByLabel("New governor", { exact: true })).toContainText("Officer 5");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const saved = (await history())[0];
  expect(saved?.manifest.artifacts.find(({ name }) => name === "save.srm")).toEqual(
    original?.manifest.artifacts.find(({ name }) => name === "save.srm"),
  );
  const response = await page.request.get(
    `/api/revisions/${saved?.id}/file?name=__runtime%2Fstate.bin`,
  );
  expect(response.status()).toBe(200);
  const restored = new San3Document(
    openSnapshotMemory(new Uint8Array(await response.body()), "picodrive", "program").bytes,
  );
  expect(restored.read(restored.offset("cities", 1) + 4, 2)).toBe(4);
  expect(restored.read(restored.offset("cities", 1) + 10, 2)).toBe(0xffff);
  expect(restored.officer(3)).toMatchObject({ role: 3, soldiers: 3000, loyalty: 75 });
  expect(restored.officer(4)).toMatchObject({ role: 1, soldiers: 3000, loyalty: 75 });
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
