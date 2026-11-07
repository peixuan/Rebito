import { expect, test } from "@playwright/test";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { editorFixture } from "../editors/fixture.ts";
import { openEditor } from "./editor-session.ts";
import { sourcePerson } from "./source-labels.ts";

test("clamps compact fields, preserves cross-module drafts and saves multiple slots", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const bytes = editorFixture();
  bytes.set([21, 10, 10, 24], 0x97 + 6);
  bytes.fill(255, 0x97 + 0x2177, 0x97 + 0x2195);
  bytes.set(new TextEncoder().encode("11/ 11/1522"), 136);
  bytes[0x97 + 9 * 0x8074 + 0x611] = 5;
  const editor = await openEditor(page, "Editor regression", bytes);
  const money = editor.getByLabel("Money", { exact: true });
  await expect(money).toHaveValue("2779096485");
  const size = await money.boundingBox();
  expect(size?.width).toBeLessThan(150);
  await money.fill("9".repeat(100));
  await money.press("Tab");
  await expect(money).toHaveValue("600000000");
  await editor.getByLabel("Year", { exact: true }).fill("0");
  await editor.getByLabel("Year", { exact: true }).press("Enter");
  await expect(editor.getByLabel("Year", { exact: true })).toHaveValue("1501");
  await editor.getByRole("button", { name: "Characters", exact: true }).click();
  await editor.getByLabel("Leadership", { exact: true }).fill("77");
  await editor.getByLabel("Leadership", { exact: true }).press("Tab");
  await expect(editor.getByLabel("Affiliation state", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Sailor affiliation", exact: true }).click();
  await editor.getByLabel("Search records").fill(sourcePerson(6).split("·")[0] ?? "");
  await editor
    .getByRole("row")
    .filter({ hasText: sourcePerson(6) })
    .click();
  await editor.getByRole("button", { name: "Recruit", exact: true }).click();
  await expect(editor.getByRole("row").filter({ hasText: sourcePerson(6) })).toContainText(
    "Companion",
  );
  await editor.getByRole("button", { name: "Map and discoveries", exact: true }).click();
  await editor.getByRole("button", { name: "Reveal the entire map", exact: true }).click();
  await editor.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(money).toHaveValue("600000000");
  await editor.getByLabel("Save slot to edit").click();
  await page.getByRole("option", { name: /Save 10 ·/ }).click();
  await money.fill("1");
  await money.press("Tab");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved as a new revision");
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  const profile = profiles.find((entry) => entry.name === "Editor regression");
  const history: Revision[] = await (
    await page.request.get(`/api/profiles/${profile?.id}/revisions`)
  ).json();
  expect(history).toHaveLength(2);
  expect(history[0]?.source).toBe("editor");
  const result = await (
    await page.request.get(`/api/revisions/${history[0]?.id}/file?name=KOUKAI2.DAT`)
  ).body();
  const expected = Buffer.from(bytes);
  expected.set([0, 70, 195, 35], 0x6a1);
  expected[0x97 + 6] = 0;
  expected[0x97 + 0x62c + 2] = 77;
  expected[0x97 + 0x2177] = 6;
  expected.set([0, 255, 6], 0x97 + 0x62c + 6 * 50 + 0x12);
  expected.fill(255, 0x97 + 0x144, 0x97 + 0x144 + 539);
  expected[0x97 + 0x144 + 539] = 0xc0;
  expected.set([1, 0, 0, 0], 0x6a1 + 9 * 0x8074);
  expect(result).toEqual(expected);
  await editor.getByRole("button", { name: "Discard draft and reload" }).click();
  await expect(money).toHaveValue("600000000");
  await page.screenshot({ path: info.outputPath("editor.png"), animations: "disabled" });
});
