import { expect, test } from "@playwright/test";
import { San3Document } from "../../src/editors/san3/document.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { startSan3Session } from "./san3-session.ts";

test("disbands and creates armies while preserving native saves and showing dependent effects", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { history } = await startSan3Session(page, san3GovernanceFixture(), "SAN3 army fixture");
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Officers", exact: true }).click();
  const before = (await history())[0];
  await editor.getByLabel("Soldiers", { exact: true }).fill("0");
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const preview = page.getByRole("dialog");
  await expect(preview).toContainText("Training");
  await expect(preview).toContainText("Morale");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  await expect(editor.getByLabel("Soldiers", { exact: true })).toBeEnabled();
  await expect(editor.getByLabel("Training", { exact: true })).toBeDisabled();
  await editor.getByLabel("Soldiers", { exact: true }).fill("1000");
  await editor.getByLabel("Soldiers", { exact: true }).press("Tab");
  await editor.getByLabel("Training", { exact: true }).fill("80");
  await editor.getByLabel("Morale", { exact: true }).fill("90");
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
  expect(document.officer(0)).toMatchObject({ soldiers: 1000, training: 80, morale: 90, role: 0 });
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
