import { expect, test } from "@playwright/test";
import { dosEditorSave } from "../library/dos-editor-fixture.ts";
import { useSession } from "./session.ts";

test("refresh captures live DOS writes, updates the editor and preserves dirty drafts", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await useSession(page.context(), "player");
  await page.goto("/");
  await page.getByRole("button", { name: /DOS live edit test/ }).click();
  await page.getByLabel("Profile name").fill("In-game save synchronization");
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByLabel("Save files").setInputFiles({
    name: "KOUKAI2.DAT",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(dosEditorSave(123)),
  });
  await page.getByRole("button", { name: "Upload save", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  const money = editor.getByLabel("Money", { exact: true });
  await expect(money).toHaveValue("123");
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const refresh = page.getByRole("button", { name: "Synchronize and refresh", exact: true });
  await expect(refresh).toBeEnabled({ timeout: 30_000 });
  const game = page.getByRole("region", { name: "Game window", exact: true });
  async function saveInsideDos(source: string) {
    await page.frameLocator("iframe").locator("canvas").click();
    await page.keyboard.type(`copy /y ${source}.DAT KOUKAI2.DAT`, { delay: 25 });
    await page.keyboard.press("Enter", { delay: 150 });
  }
  async function downloaded() {
    const url = await page
      .getByRole("link", { name: "KOUKAI2.DAT", exact: true })
      .first()
      .getAttribute("href");
    if (!url) throw new Error("Missing native save download");
    return (await page.request.get(url)).body();
  }
  await saveInsideDos("NEXT");
  await expect(money).toHaveValue("123"); // Still the server version before synchronization.
  await refresh.click();
  await expect(money).toHaveValue("456");
  expect(await downloaded()).toEqual(Buffer.from(dosEditorSave(456)));
  await expect(game.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled();

  await money.fill("999");
  await money.press("Tab");
  await saveInsideDos("FIRST");
  await refresh.click();
  await expect(editor.getByRole("alert")).toContainText("A newer save exists");
  await expect(money).toHaveValue("999");
  await expect(editor.getByRole("button", { name: "Save edits", exact: true })).toBeDisabled();
  expect(await downloaded()).toEqual(Buffer.from(dosEditorSave(123)));
  await editor.getByRole("button", { name: "Discard draft and reload", exact: true }).click();
  await expect(money).toHaveValue("123");

  const versions = page.getByRole("link", { name: "KOUKAI2.DAT", exact: true });
  const count = await versions.count();
  await page.route("**/api/profiles/*/revisions", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"unavailable"}',
      });
    else await route.continue();
  });
  await refresh.click();
  await expect(game.getByRole("alert")).toBeVisible();
  await expect(game.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  await expect(versions).toHaveCount(count);
  await game.getByRole("button", { name: "Stop game", exact: true }).click();
  await expect(game.getByRole("alert")).toBeVisible();
  await expect(page.frameLocator("iframe").locator("canvas")).toBeVisible();
  await page.unroute("**/api/profiles/*/revisions");
  await game.getByRole("button", { name: "Stop game", exact: true }).click();
  await expect(versions).toHaveCount(count + 1);
  await expect(game.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start game", exact: true })).toBeVisible();
  expect(await downloaded()).toEqual(Buffer.from(dosEditorSave(123)));
});
