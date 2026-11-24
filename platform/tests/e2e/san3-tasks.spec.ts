import { expect, test } from "@playwright/test";
import { inspectSan3Task } from "../../src/editors/san3/campaign-tasks.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("assembles task controls locally and applies a paused memory assignment", async ({ page }) => {
  test.setTimeout(90_000);
  const { history } = await prepareSan3Editor(page, san3GovernanceFixture(), "SAN3 task fixture");
  await page.goto("/");
  await page.getByRole("button", { name: /SAN3 task fixture/ }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await editor.getByLabel("Task", { exact: true }).click();
  await page.getByRole("option", { name: "Spying", exact: true }).click();
  await editor.getByLabel("Task duration (months)", { exact: true }).fill("4");
  await editor.getByLabel("Spy destination", { exact: true }).click();
  await page.getByRole("option", { name: "City 4", exact: true }).click();
  await expect(editor.getByLabel("Intelligence score", { exact: true })).toBeEnabled();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.task.totalMonths"), { exact: true })).toHaveValue("4");
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor.getByLabel("Task", { exact: true }).click();
  await page.getByRole("option", { name: "None / cancel task", exact: true }).click();
  await expect(editor.getByLabel("Spy destination", { exact: true })).toBeDisabled();
  await editor.getByLabel("Task", { exact: true }).click();
  await page.getByRole("option", { name: "Training", exact: true }).click();
  await editor.getByLabel("Task duration (months)", { exact: true }).fill("2");
  await editor.getByLabel("Training base gain", { exact: true }).fill("10");
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const preview = page.getByRole("dialog");
  await expect(preview).toContainText("Officer 1");
  await expect(preview).toContainText("Training");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  const before = (await history())[0];
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const after = (await history())[0];
  expect(after?.manifest.artifacts.find(({ name }) => name === "save.srm")).toEqual(
    before?.manifest.artifacts.find(({ name }) => name === "save.srm"),
  );
  const response = await page.request.get(
    `/api/revisions/${after?.id}/file?name=__runtime%2Fstate.bin`,
  );
  expect(response.status()).toBe(200);
  const document = new San3Document(
    openSnapshotMemory(new Uint8Array(await response.body()), "picodrive", "program").bytes,
  );
  expect(inspectSan3Task(document, 0)).toMatchObject({
    kind: 1,
    totalMonths: 2,
    elapsedMonths: 0,
    effect: 10,
  });
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
