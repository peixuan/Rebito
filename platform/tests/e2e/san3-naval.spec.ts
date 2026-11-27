import { expect, test } from "@playwright/test";
import { San3BattleDocument } from "../../src/editors/san3/battle.ts";
import { san3Layout } from "../../src/editors/san3/document.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3BattleFixture } from "../editors/san3-battle-fixture.ts";
import { startSan3Session } from "./san3-session.ts";

test("exchanges naval equipment atomically and writes battle stats into the paused core", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const program = san3BattleFixture();
  const data = new DataView(program.buffer);
  data.setUint16(0x52056, 1);
  program[san3Layout.officers.offset + 10] = 0x74;
  program[san3Layout.cities.offset + 21] = 0x80;
  program[san3Layout.cities.offset + 43] = 0;
  program[san3Layout.cities.offset + 44] = 3;
  const { history } = await startSan3Session(page, program, "SAN3 naval fixture");
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Remaining mobility", { exact: true })).toBeEnabled();
  const before = (await history())[0];
  await editor.getByLabel("Warship type", { exact: true }).click();
  await expect(page.getByRole("option", { name: "No vessel", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Medium warships", exact: true }).click();
  await editor.getByLabel("Soldiers", { exact: true }).fill("2100");
  await editor.getByLabel("Training", { exact: true }).fill("100");
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const preview = page.getByRole("dialog");
  await expect(preview).toContainText("Heavy warships");
  await expect(preview).toContainText("Medium warships");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
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
  const memory = openSnapshotMemory(
    new Uint8Array(await response.body()),
    "picodrive",
    "program",
  ).bytes;
  expect(new San3BattleDocument(memory).officer(0)).toMatchObject({
    ship: 2,
    soldiers: 2100,
    training: 100,
    mobility: 5,
  });
  expect(memory[san3Layout.cities.offset + 43]).toBe(1);
  expect(memory[san3Layout.cities.offset + 44]).toBe(2);
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
