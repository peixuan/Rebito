import { expect, test } from "@playwright/test";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { editorFixture } from "../editors/fixture.ts";
import { openEditor } from "./editor-session.ts";
import { sourcePerson } from "./source-labels.ts";

test("sorts numeric columns and retains record, search and validation state", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 980, height: 820 });
  const bytes = editorFixture();
  bytes.fill(255, 0x97 + 0x2177, 0x97 + 0x2195);
  bytes.set([0, 1, 2], 0x97 + 0x2177);
  for (const [index, value] of [2, 10, 3].entries()) bytes[0x97 + 0x62c + index * 50 + 2] = value;
  const editor = await openEditor(page, "Control regression", bytes);
  await editor.getByRole("button", { name: "Characters", exact: true }).click();
  const companionFilter = editor.getByRole("checkbox", { name: "Companions only" });
  await expect(companionFilter).not.toBeChecked();
  await companionFilter.check();
  await expect(editor.locator("tbody tr")).toHaveCount(3);
  await editor.getByLabel("Visible columns").press("Space");
  await page.getByRole("option", { name: "Abilities · Leadership", exact: true }).click();
  await page.keyboard.press("Escape");
  const header = editor.getByRole("columnheader", { name: /Abilities · Leadership/ });
  await header.click();
  const rows = editor.locator("tbody tr");
  await expect(rows.nth(0)).toContainText(sourcePerson(0));
  await expect(rows.nth(1)).toContainText(sourcePerson(2));
  await expect(rows.nth(2)).toContainText(sourcePerson(1));
  await rows.nth(2).click();
  const leadership = editor.getByLabel("Leadership", { exact: true });
  await expect(leadership).toHaveValue("10");
  await header.click();
  await expect(leadership).toHaveValue("10");
  await editor.getByLabel("Search records").fill(`${sourcePerson(1).split("·")[0]} Companion`);
  await expect(rows).toHaveCount(1);
  await editor.getByRole("button", { name: "Ship types", exact: true }).click();
  await editor.getByRole("button", { name: "Characters", exact: true }).click();
  await expect(editor.getByLabel("Search records")).toHaveValue(
    `${sourcePerson(1).split("·")[0]} Companion`,
  );
  await expect(leadership).toHaveValue("10");
  await expect(header).toBeVisible();
  await expect(companionFilter).toBeChecked();
  await expect(
    editor
      .getByRole("group", { name: "Sailor affiliation", exact: true })
      .getByText("Unrecognized original value #165"),
  ).toBeVisible();
  await leadership.fill("-");
  await leadership.press("Tab");
  await expect(editor.getByRole("button", { name: "Save edits", exact: true })).toBeDisabled();
  await expect(editor.getByRole("button", { name: "Ship types", exact: true })).toBeDisabled();
  await leadership.fill("9999");
  await leadership.press("Enter");
  await expect(leadership).toHaveValue("255");
  await expect(rows.first()).toContainText("255");
  await expect(editor.getByRole("button", { name: "Save edits", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Back to library" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath("records.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await editor.getByRole("button", { name: "Discard draft and reload" }).click();
  await expect(page.getByRole("button", { name: "Back to library" })).toBeEnabled();
});

test("keeps drafts when a game upload advances the head and requires an explicit reload", async ({
  page,
}) => {
  const bytes = editorFixture();
  const editor = await openEditor(page, "Conflict regression", bytes);
  const money = editor.getByLabel("Money", { exact: true });
  await money.fill("42");
  await money.press("Tab");
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  const profile = profiles.find((entry) => entry.name === "Conflict regression");
  if (!profile) throw new Error("Missing conflict profile");
  const history: Revision[] = await (
    await page.request.get(`/api/profiles/${profile.id}/revisions`)
  ).json();
  bytes.set([3, 0, 0, 0], 0x6a1);
  const upload = await page.request.post(`/api/profiles/${profile.id}/revisions`, {
    headers: { origin: "http://localhost:4317" },
    multipart: {
      metadata: JSON.stringify({
        kind: "game-save",
        releaseId: profile.releaseId,
        baseRevision: history[0]?.id,
      }),
      file: {
        name: "KOUKAI2.DAT",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(bytes),
      },
    },
  });
  expect(upload.status()).toBe(201);
  await page.getByRole("button", { name: "Refresh saves", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("A newer save exists");
  await expect(money).toHaveValue("42");
  await expect(editor.getByRole("button", { name: "Save edits", exact: true })).toBeDisabled();
  await editor.getByRole("button", { name: "Discard draft and reload" }).click();
  await expect(money).toHaveValue("3");
});
