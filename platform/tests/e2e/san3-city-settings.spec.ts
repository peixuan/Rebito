import { expect, test } from "@playwright/test";
import { San3Document } from "../../src/editors/san3/document.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { governanceCity, san3GovernanceFixture } from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { startSan3Session } from "./san3-session.ts";

test("previews translated delegation modes and preserves unrelated city flags", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const memory = san3GovernanceFixture();
  memory[governanceCity(1) + 21] = 0x80;
  memory[governanceCity(1) + 23] = 0xe5;
  const { history } = await startSan3Session(page, memory, "SAN3 city settings fixture", 0x5f);
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("City 2", { exact: true }) })
    .click();
  await editor.getByLabel("City administration", { exact: true }).click();
  await expect(page.getByRole("option", { name: "Direct", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Adaptive", exact: true }).click();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const preview = page.getByRole("dialog");
  await expect(preview).toContainText("Military");
  await expect(preview).toContainText("Adaptive");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.delegationMode"), { exact: true })).toContainText(
    chinese("san3.delegation3"),
  );
  await page.getByLabel(chinese("app.language")).selectOption("en");
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
  expect(restored.read(governanceCity(1) + 23, 1)).toBe(0xe7);
  expect(restored.read(governanceCity(1) + 21, 1)).toBe(0x80);
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
