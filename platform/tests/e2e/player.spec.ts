import { expect, test } from "@playwright/test";
import { useSession } from "./session.ts";

test("plays DOS in the workspace and publishes bytes through the cloud revision API", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await useSession(page.context(), "player");
  await page.goto("/");
  await page.getByRole("button", { name: /DOS save test/ }).click();
  await page.getByLabel("Profile name").fill("Real emulator");
  await page.getByRole("button", { name: "Create profile" }).click();
  await page.getByRole("button", { name: "Open profile" }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  const save = page.getByRole("button", { name: "Save to account" });
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await expect(page.frameLocator("iframe").locator("canvas")).toBeVisible();
  await expect
    .poll(async () => {
      await save.click();
      await expect(page.getByRole("status")).toContainText("saved to your account");
      return page.getByRole("link", { name: "SAVE.DAT", exact: true }).count();
    })
    .toBeGreaterThan(0);
  const first = await page
    .getByRole("link", { name: "SAVE.DAT", exact: true })
    .first()
    .getAttribute("href");
  if (!first) throw new Error("Missing cloud save link");
  expect(await (await page.request.get(first)).body()).toEqual(Buffer.from("FIRST\r\n"));
  await page.getByLabel("Save files").setInputFiles({
    name: "SAVE.DAT",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("SECOND\r\n"),
  });
  await page.getByRole("button", { name: "Upload save" }).click();
  await expect(page.getByRole("button", { name: "Start game" })).toBeVisible();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(save).toBeEnabled();
  await page.getByRole("button", { name: "Pause game" }).click();
  await save.click();
  await expect(page.getByRole("button", { name: "Resume game" })).toBeEnabled();
  const latest = await page
    .getByRole("link", { name: "SAVE.DAT", exact: true })
    .first()
    .getAttribute("href");
  if (!latest) throw new Error("Missing replacement save link");
  expect(await (await page.request.get(latest)).body()).toEqual(Buffer.from("SECOND\r\n"));
  await page.screenshot({ path: info.outputPath("workspace.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Stop game" }).click();
  await expect(page.getByRole("button", { name: "Start game" })).toBeVisible();
});
