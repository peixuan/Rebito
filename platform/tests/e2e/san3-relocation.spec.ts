import { expect, test } from "@playwright/test";
import { San3Document } from "../../src/editors/san3/document.ts";
import { inspectSan3Lists } from "../../src/editors/san3/relocation.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { startSan3Session } from "./san3-session.ts";

test("offers valid leader moves and applies a reviewed multi-officer relocation", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { history } = await startSan3Session(
    page,
    san3GovernanceFixture(),
    "SAN3 relocation fixture",
    0x5e,
  );
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await expect(editor.getByLabel("Move to city", { exact: true })).toBeEnabled();
  await editor.getByLabel("Move to city", { exact: true }).click();
  await expect(page.getByRole("option", { name: "City 2", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "City 5", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(
    page.getByRole("region", { name: chinese("editor.title"), exact: true }),
  ).toContainText(chinese("san3.relocationHelp"));
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("Officer 2", { exact: true }) })
    .click();
  await expect(editor).toContainText("Same-faction moves keep armies");
  await editor.getByLabel("Move to city", { exact: true }).click();
  await page.getByRole("option", { name: "City 5", exact: true }).click();
  await editor.getByLabel("Copy to records", { exact: true }).press("Space");
  for (const name of ["Officer 3", "Officer 5"])
    await page.getByRole("option", { name, exact: true }).click();
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Copy changed fields", exact: true }).click();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const preview = page.getByRole("dialog");
  for (const name of ["Officer 2", "Officer 3", "Officer 5"])
    await expect(preview).toContainText(name);
  await expect(preview).toContainText("Soldiers");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  const original = (await history())[0];
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
  expect(inspectSan3Lists(restored).cities[4]?.free).toEqual([9, 1, 2, 4]);
  for (const index of [1, 2, 4])
    expect(restored.officer(index)).toMatchObject({ city: 4, soldiers: 0, role: 5 });
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
