import { expect, test } from "@playwright/test";
import { San3Document } from "../../src/editors/san3/document.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { governanceOfficer, san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { startSan3Session } from "./san3-session.ts";

test("establishes, times and ends covert service through independent memory workflows", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const program = san3GovernanceFixture();
  program[governanceOfficer(1) + 18] = 1;
  const { history } = await startSan3Session(page, program, "SAN3 covert fixture");
  const capture = page.getByRole("button", { name: "Capture for editing", exact: true });
  await capture.click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("Officer 2", { exact: true }) })
    .click();
  const before = (await history())[0];
  await editor.getByLabel("Serve secretly for faction", { exact: true }).click();
  await page.getByRole("option", { name: "Officer 7's faction", exact: true }).click();
  await editor.getByLabel("Prior service for covert faction", { exact: true }).fill("3");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  await capture.click();
  await expect(editor.getByLabel("Covert service months elapsed", { exact: true })).toBeEnabled();
  await editor.getByLabel("Covert service months elapsed", { exact: true }).fill("4");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  async function memory() {
    const latest = (await history())[0];
    const response = await page.request.get(
      `/api/revisions/${latest?.id}/file?name=__runtime%2Fstate.bin`,
    );
    expect(response.status()).toBe(200);
    return openSnapshotMemory(new Uint8Array(await response.body()), "picodrive", "program").bytes;
  }
  expect((await memory())[governanceOfficer(1) + 11]).toBe(0xec);
  await capture.click();
  const end = editor.getByRole("checkbox", { name: "End covert affiliation", exact: true });
  await expect(end).toBeEnabled();
  await end.check();
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const bytes = await memory();
  expect(bytes[governanceOfficer(1) + 11]).toBe(0xe0);
  expect(bytes[governanceOfficer(1) + 19]).toBe(255);
  expect(bytes[governanceOfficer(1) + 20]).toBe(3);
  expect(new San3Document(bytes).officer(1)).toMatchObject({
    faction: 0,
    city: 0,
    role: 2,
    soldiers: 3000,
  });
  expect((await history())[0]?.manifest.artifacts.find(({ name }) => name === "save.srm")).toEqual(
    before?.manifest.artifacts.find(({ name }) => name === "save.srm"),
  );
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
