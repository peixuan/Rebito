import { expect, test } from "@playwright/test";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import {
  governanceCity,
  governanceOfficer,
  san3GovernanceFixture,
} from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("keeps disabled features discoverable and bilingual drafts intact in the compact layout", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { game, history } = await prepareSan3Editor(
    page,
    san3GovernanceFixture(),
    "SAN3 layout fixture",
  );
  await page.goto("/");
  await page.getByRole("button", { name: game.title }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  const modules = editor.getByRole("navigation", { name: "Editor modules" });
  await expect(modules.getByRole("button")).toHaveCount(8);
  for (const name of ["Battle", "City reserves", "New officer creation defaults"])
    await expect(modules.getByRole("button", { name, exact: true })).toBeDisabled();
  const queue = editor.getByLabel("Heavy warships: months remaining", { exact: true });
  await expect(queue).toBeVisible();
  await expect(queue).toBeDisabled();
  await expect(queue).toHaveValue("—");
  await expect(queue).toHaveAccessibleDescription(/Requires a player-controlled port/);
  await expect(editor.getByText(/Requires a player-controlled port/)).toHaveCount(1);
  await editor.getByLabel("Population", { exact: true }).fill("105000");
  await editor.getByLabel("Population", { exact: true }).press("Tab");
  await modules.getByRole("button", { name: "Officers", exact: true }).click();
  await editor.getByLabel("Search records", { exact: true }).fill("2");
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("Officer 2", { exact: true }) })
    .click();
  await expect(editor.getByLabel("Strength", { exact: true })).toBeDisabled();
  await editor.getByLabel("Morale", { exact: true }).fill("99");
  await editor.getByLabel("Morale", { exact: true }).press("Tab");
  await page.getByLabel("Language").selectOption("zh-CN");
  const translated = page.getByRole("region", { name: chinese("editor.title"), exact: true });
  await expect(translated.getByLabel(chinese("san3.morale"), { exact: true })).toHaveValue("99");
  await expect(translated.getByText(chinese("san3.serviceYearsHelp"), { exact: true })).toHaveCount(
    1,
  );
  const sections = translated.getByRole("navigation", { name: chinese("editor.sections") });
  await sections.getByRole("link", { name: chinese("san3.tasks"), exact: true }).click();
  await expect(translated.getByLabel(chinese("san3.taskJoin"), { exact: true })).toBeDisabled();
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await translated.screenshot({ path: test.info().outputPath(`editor-${width}.png`) });
    expect(
      await translated.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await expect(translated.getByLabel(chinese("san3.morale"), { exact: true })).toHaveValue("99");
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await modules.getByRole("button", { name: "Cities", exact: true }).click();
  await expect(editor.getByLabel("Population", { exact: true })).toHaveValue("105000");
  await modules.getByRole("button", { name: "Officers", exact: true }).click();
  await expect(editor.getByLabel("Search records", { exact: true })).toHaveValue("2");
  await expect(editor.getByLabel("Morale", { exact: true })).toHaveValue("99");
  const before = (await history())[0];
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor).toContainText("Edits were saved as a new revision");
  await expect(
    page.getByRole("status").filter({ hasText: "Changes were confirmed in the paused game" }),
  ).toBeVisible();
  const saved = (await history())[0];
  const file = await page.request.get(
    `/api/revisions/${saved?.id}/file?name=__runtime%2Fstate.bin`,
  );
  expect(file.status()).toBe(200);
  const bytes = openSnapshotMemory(new Uint8Array(await file.body()), "picodrive", "program").bytes;
  expect(new DataView(bytes.buffer, bytes.byteOffset).getUint16(governanceCity(0) + 12)).toBe(1050);
  expect(bytes[governanceOfficer(1) + 22]).toBe(99);
  expect(saved?.manifest.artifacts.find(({ name }) => name === "save.srm")).toEqual(
    before?.manifest.artifacts.find(({ name }) => name === "save.srm"),
  );
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
  expect(errors).toEqual([]);
});
