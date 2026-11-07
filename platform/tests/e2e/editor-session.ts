import { expect, type Page } from "@playwright/test";
import { useSession } from "./session.ts";

export async function openEditor(page: Page, name: string, bytes: Uint8Array) {
  await useSession(page.context(), "editor");
  await page.goto("/");
  await page.getByRole("button", { name: /Koukai2 editor test/ }).click();
  await page.getByLabel("Profile name").fill(name);
  await page.getByRole("button", { name: "Create profile" }).click();
  await page
    .locator(".profile-row")
    .filter({ has: page.getByText(name, { exact: true }) })
    .getByRole("button", { name: "Open profile" })
    .click();
  await page.getByLabel("Save files").setInputFiles({
    name: "KOUKAI2.DAT",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(bytes),
  });
  await page.getByRole("button", { name: "Upload save" }).click();
  const editor = page.getByRole("region", { name: "Save editor" });
  await expect(editor.getByLabel("Money", { exact: true })).toBeVisible();
  return editor;
}
