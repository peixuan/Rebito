import { expect, test } from "@playwright/test";
import { San3Document } from "../../src/editors/san3/document.ts";
import { inspectSan3TurnOrder } from "../../src/editors/san3/turn-order.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3TurnOrderFixture } from "../editors/san3-turn-order-fixture.ts";
import { chinese } from "./locales.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("edits faction diplomacy, symbols and upcoming turns without changing native companions", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { history } = await prepareSan3Editor(
    page,
    san3TurnOrderFixture(),
    "SAN3 faction settings fixture",
    0x67,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /SAN3 faction settings fixture/ }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Population", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Factions", exact: true }).click();
  await expect(editor.getByLabel("This month’s position", { exact: true })).toBeDisabled();
  await editor
    .getByRole("row")
    .filter({ has: page.getByText("Officer 14's faction", { exact: true }) })
    .click();
  for (const [label, option] of [
    ["This month’s position", "3"],
    ["Controlled by", "Player"],
    ["Faction symbol", "Neutral-city symbol"],
  ] as const) {
    await editor.getByLabel(label, { exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  }
  const relation = editor.getByRole("group", { name: "Officer 12's faction", exact: true });
  await relation.getByLabel("Alliance", { exact: true }).click();
  await page.getByRole("option", { name: "Yes", exact: true }).click();
  await relation.getByLabel("Hostility", { exact: true }).fill("37");
  await relation.getByLabel("Hostility", { exact: true }).press("Tab");
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("This month’s position");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel(chinese("san3.turnPosition"), { exact: true })).toContainText("3");
  await page.getByLabel(chinese("app.language")).selectOption("en");
  const before = (await history())[0];
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const after = (await history())[0];
  const response = await page.request.get(
    `/api/revisions/${after?.id}/file?name=__runtime%2Fstate.bin`,
  );
  expect(response.status()).toBe(200);
  const document = new San3Document(
    openSnapshotMemory(new Uint8Array(await response.body()), "picodrive", "program").bytes,
  );
  expect(inspectSan3TurnOrder(document)).toEqual({ factions: [1, 0, 4, 2, 3], cursor: 1 });
  expect(document.read(0x78790, 1)).toBe(24);
  expect(document.read(0x7dc0e, 1)).toBe(1);
  expect(document.read(document.offset("factions", 4) + 6, 4)).toBe(4);
  expect(document.read(document.offset("factions", 2) + 6, 4)).toBe(16);
  expect(document.read(document.offset("factions", 4) + 17, 1)).toBe(37);
  expect(after?.manifest.artifacts.find(({ name }) => name === "save.srm")).toEqual(
    before?.manifest.artifacts.find(({ name }) => name === "save.srm"),
  );
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
