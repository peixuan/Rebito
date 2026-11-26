import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { useSession } from "./session.ts";

test("manages session-only cheats in the NES player", async ({ page }) => {
  await useSession(page.context(), "console");
  await page.goto("/");
  await page.getByRole("button", { name: /\bNES runtime test/ }).click();
  const profile = `Trainer ${randomUUID()}`;
  await page.getByLabel("Profile name").fill(profile);
  await page.getByRole("button", { name: "Create profile" }).click();
  await page
    .locator(".profile-row")
    .filter({ hasText: profile })
    .getByRole("button", { name: "Open profile" })
    .click();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.locator("summary").filter({ hasText: "NES cheats" }).click({ timeout: 30000 });
  const panel = page.getByRole("group", { name: "Cheat codes" });
  const input = panel.getByLabel("Code", { exact: true });
  await input.fill("00FE:09");
  await panel.getByLabel("Label (optional)").fill("My counter");
  await panel.getByRole("button", { name: "Apply code" }).click();
  const enabled = panel.getByRole("checkbox", { name: /My counter/ });
  await expect(enabled).toBeChecked();
  await input.fill("2000:00");
  await panel.getByRole("button", { name: "Apply code" }).click();
  await expect(page.getByRole("alert")).toContainText("valid NES code");
  await expect(enabled).toBeChecked();
  await enabled.uncheck();
  await expect(enabled).not.toBeChecked();
  await panel.getByRole("button", { name: "Remove 00FE:09" }).click();
  await expect(enabled).toHaveCount(0);
});
