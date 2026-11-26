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
  await input.fill("0000FE09");
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

  const files = page.getByRole("group", { name: "Cheat files" });
  await files.getByLabel("Open a RetroArch .cht file").setInputFiles({
    name: "own.cht",
    mimeType: "text/plain",
    buffer: Buffer.from(
      'cheats = 1\ncheat0_desc = "Word value"\ncheat0_code = "0000FA07+00FB:01"\ncheat0_enable = true',
    ),
  });
  await expect(files.getByRole("status")).toContainText("1 supported");
  await expect(panel.getByRole("checkbox")).toHaveCount(0);
  await files.getByLabel("Choose a rule").selectOption("00FA:07+00FB:01");
  await files.getByRole("button", { name: "Apply code" }).click();
  await expect(panel.getByRole("checkbox", { name: /Word value/ })).toBeChecked();
  const download = page.waitForEvent("download");
  await files.getByRole("button", { name: "Export session rules" }).click();
  expect((await download).suggestedFilename()).toMatch(/^nes-[a-f0-9]{12}\.cht$/);

  const search = page.getByRole("group", { name: "Find a value in RAM" });
  await search.getByLabel("Value in game").fill("9");
  await search.getByRole("button", { name: "Start search" }).click();
  const match = search.getByRole("button", { name: "00FE · 9", exact: true });
  await match.click();
  await search.getByLabel("New value at 00FE").fill("42");
  await search.getByRole("button", { name: "Apply value" }).click();
  await expect(panel.getByRole("checkbox", { name: /00FE:2A/ })).toBeChecked();
  await search.getByLabel("Value in game").fill("42");
  await expect(async () => {
    // Keep the original candidate set until the core's next frame has run.
    await search.getByRole("button", { name: "New search", exact: true }).click();
    await search.getByRole("button", { name: "Start search" }).click();
    await expect(search.getByRole("button", { name: "00FE · 42", exact: true })).toBeVisible({
      timeout: 500,
    });
  }).toPass({ timeout: 5000 });
});
