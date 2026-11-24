import { expect, test } from "@playwright/test";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import {
  governanceCity,
  governanceOfficer,
  san3GovernanceFixture,
} from "../editors/san3-governance-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("edits independent port queues without completing ships or spending resources", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const program = san3GovernanceFixture();
  const city = governanceCity(1);
  program[city + 21] = 128;
  program[city + 23] = 0xa4;
  program[city + 42] = 2 | (5 << 3) | (1 << 6);
  program.set([99, 25, 12], city + 43);
  program[0x7dc0a] = 1;
  const { history } = await prepareSan3Editor(page, program, "SAN3 shipbuilding fixture");
  await page.goto("/");
  await page.getByRole("button", { name: /SAN3 shipbuilding fixture/ }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const capture = page.getByRole("button", { name: "Capture for editing", exact: true });
  await capture.click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await expect(editor.getByLabel("Heavy warships: months remaining", { exact: true })).toHaveCount(
    0,
  );
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("City 2", { exact: true }) })
    .click();
  const before = (await history())[0];
  async function save(expected: number) {
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
    const bytes = openSnapshotMemory(
      new Uint8Array(await response.body()),
      "picodrive",
      "program",
    ).bytes;
    const expectedCity = program.slice(city, city + 52);
    expectedCity[42] = expected;
    expect(bytes.slice(city, city + 52)).toEqual(expectedCity);
    expect(bytes.slice(governanceOfficer(3), governanceOfficer(6))).toEqual(
      program.slice(governanceOfficer(3), governanceOfficer(6)),
    );
  }
  await editor.getByLabel("Heavy warships: months remaining", { exact: true }).fill("1");
  await editor.getByLabel("Medium warships: months remaining", { exact: true }).fill("0");
  await editor.getByLabel("Light warships: months remaining", { exact: true }).fill("3");
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.shipbuildingHeavy"), { exact: true })).toHaveValue(
    "1",
  );
  await expect(page.getByLabel(chinese("san3.shipbuildingMedium"), { exact: true })).toHaveValue(
    "0",
  );
  await expect(page.getByLabel(chinese("san3.shipbuildingLight"), { exact: true })).toHaveValue(
    "3",
  );
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const preview = page.getByRole("dialog");
  for (const label of [
    "Heavy warships: months remaining",
    "Medium warships: months remaining",
    "Light warships: months remaining",
  ])
    await expect(preview).toContainText(label);
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await save(1 | (3 << 6));
  await capture.click();
  await expect(
    editor.getByLabel("Heavy warships: months remaining", { exact: true }),
  ).toBeEnabled();
  await editor.getByLabel("Heavy warships: months remaining", { exact: true }).fill("0");
  await save(3 << 6);
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
