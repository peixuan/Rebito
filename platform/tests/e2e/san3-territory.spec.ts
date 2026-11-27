import { expect, test } from "@playwright/test";
import { San3Document } from "../../src/editors/san3/document.ts";
import { inspectSan3Lists } from "../../src/editors/san3/relocation.ts";
import { san3TreasureLayout } from "../../src/editors/san3/treasures.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { startSan3Session } from "./san3-session.ts";

test("transfers then abandons territory with explicit army effects", async ({ page }) => {
  test.setTimeout(90_000);
  const program = san3GovernanceFixture();
  const data = new DataView(program.buffer);
  for (let index = 1; index < 13; index++)
    data.setUint16(san3TreasureLayout.owners + index * 2, 65535);
  const { history } = await startSan3Session(page, program, "SAN3 territory fixture");
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("City 2", { exact: true }) })
    .click();
  const before = (await history())[0];
  await editor.getByLabel("Transfer city to", { exact: true }).click();
  await page.getByRole("option", { name: "Officer 7's faction", exact: true }).click();
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  await expect(editor.getByLabel("Transfer city to", { exact: true })).toBeEnabled();
  await editor.getByLabel("Transfer city to", { exact: true }).click();
  await page.getByRole("option", { name: "Neutral / abandon city", exact: true }).click();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Soldiers");
  await expect(page.getByRole("dialog")).toContainText("City strategist");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
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
  expect(inspectSan3Lists(document).cities[1]).toMatchObject({
    faction: 255,
    serving: [],
    free: [3, 4, 5],
  });
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
