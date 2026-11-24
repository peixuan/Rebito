import { expect, test } from "@playwright/test";
import { inspectSan3Task } from "../../src/editors/san3/campaign-tasks.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("joins an existing task with stable preview, cancellation and paused writeback", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const program = san3GovernanceFixture();
  const data = new DataView(program.buffer);
  program[city(0) + 24] = 2;
  for (const index of [1, 2]) {
    program[officer(index) + 9] = 0xc0;
    program[officer(index) + 26] = 1;
    program[officer(index) + 27] = 0x24;
    data.setUint16(officer(index) + 28, 0x1218);
  }
  const { history } = await prepareSan3Editor(page, program, "SAN3 task joining fixture");
  await page.goto("/");
  await page.getByRole("button", { name: /SAN3 task joining fixture/ }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const capture = page.getByRole("button", { name: "Capture for editing", exact: true });
  await capture.click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  const group = "Training — Officer 2 (2 officers)";
  const select = editor.getByLabel("Join an existing task group", { exact: true });
  await select.click();
  await page.getByRole("option", { name: group, exact: true }).click();
  async function previewChanges() {
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith("/editor/preview") && response.request().method() === "POST",
    );
    await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
    const result = await response;
    expect(result.status()).toBe(200);
    return (await result.json()).changes;
  }
  expect(await previewChanges()).toEqual({ "task.0.joinGroup": 1 });
  const preview = page.getByRole("dialog");
  for (const label of ["Task group participants", "Action completed", "2/4 months"])
    await expect(preview).toContainText(label);
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await editor.getByRole("button", { name: "Cities", exact: true }).click();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await expect(select).toContainText(group);
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.taskJoin"), { exact: true })).toContainText(
    chinese("san3.officerRecord").replace("{index}", "2"),
  );
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await select.click();
  await page.getByRole("option", { name: "None", exact: true }).click();
  expect(await previewChanges()).toEqual({});
  await expect(preview).toContainText("No edits.");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await expect(editor.getByLabel("Task", { exact: true })).toContainText("None / cancel task");
  await select.click();
  await page.getByRole("option", { name: group, exact: true }).click();
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
  const joined = await save();
  expect(inspectSan3Task(joined, 0)).toMatchObject({
    kind: 1,
    members: [0, 1, 2],
    totalMonths: 4,
    elapsedMonths: 2,
    effect: 24,
  });
  expect(joined.read(officer(0) + 28, 2)).toBe(0x1218);
  expect(joined.read(officer(0) + 8, 1) & 1).toBe(1);
  expect(joined.copy().slice(officer(1), officer(3))).toEqual(
    program.slice(officer(1), officer(3)),
  );
  expect(joined.copy().slice(city(0), city(0) + 52)).toEqual(program.slice(city(0), city(0) + 52));
  await capture.click();
  await expect(editor.getByLabel("Task", { exact: true })).toBeEnabled();
  await editor.getByLabel("Task", { exact: true }).click();
  await page.getByRole("option", { name: "None / cancel task", exact: true }).click();
  const cancelled = await save();
  for (const index of [0, 1, 2]) {
    expect(inspectSan3Task(cancelled, index).kind).toBe(255);
    expect(cancelled.read(officer(index) + 9, 1) & 64).toBe(0);
  }
  expect(cancelled.read(city(0) + 24, 1)).toBe(0);
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
