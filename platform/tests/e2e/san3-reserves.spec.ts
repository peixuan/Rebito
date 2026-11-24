import { expect, test } from "@playwright/test";
import { San3BattleDocument } from "../../src/editors/san3/battle.ts";
import { inspectSan3BattleReserves } from "../../src/editors/san3/battle-reserves.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { san3ReserveFixture } from "../editors/san3-reserve-fixture.ts";
import { prepareSan3Editor } from "./san3-session.ts";

test("preserves reserve eligibility drafts across battle views and writes them back", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { game, history } = await prepareSan3Editor(
    page,
    san3ReserveFixture(),
    "SAN3 reserves fixture",
  );
  await page.goto("/");
  await page.getByRole("button", { name: game.title }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Capture for editing", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  await expect(editor.getByLabel("Remaining mobility", { exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "City reserves", exact: true }).click();
  const before = (await history())[0];
  await editor.getByLabel("Deployed during this battle", { exact: true }).click();
  await page
    .getByRole("option", { name: "Already deployed; cannot deploy again", exact: true })
    .click();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Deployed during this battle");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await editor.getByRole("button", { name: "Battle", exact: true }).click();
  await editor.getByRole("button", { name: "City reserves", exact: true }).click();
  await expect(editor.getByLabel("Deployed during this battle", { exact: true })).toContainText(
    "Already deployed",
  );
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  const after = (await history())[0];
  const response = await page.request.get(
    `/api/revisions/${after?.id}/file?name=__runtime%2Fstate.bin`,
  );
  expect(response.status()).toBe(200);
  const memory = openSnapshotMemory(
    new Uint8Array(await response.body()),
    "picodrive",
    "program",
  ).bytes;
  const battle = new San3BattleDocument(memory);
  expect(
    inspectSan3BattleReserves(memory, new Set(battle.indexes())).reserves.find(
      ({ index }) => index === 3,
    )?.deploymentUsed,
  ).toBe(1);
  expect(after?.manifest.artifacts.find(({ name }) => name === "save.srm")).toEqual(
    before?.manifest.artifacts.find(({ name }) => name === "save.srm"),
  );
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
});
