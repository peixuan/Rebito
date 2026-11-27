import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import type { RuntimeHost } from "../../client/runtime/types.ts";
import { useSession } from "./session.ts";

async function openTrainer(page: Page) {
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
  return page.getByRole("region", { name: "NES cheats" });
}

test("switches built-in choices and recognizes the same code entered manually", async ({
  page,
}) => {
  // Test the UI with a known digest at the cartridge port. CI ships only our homebrew ROM.
  await page.addInitScript(() => {
    if (location.pathname !== "/runtime.html") return;
    let host: RuntimeHost;
    Object.defineProperty(window, "retroRuntime", {
      get: () => host,
      set(runtime: RuntimeHost) {
        host = {
          async start(launch) {
            const handle = await runtime.start(launch);
            if (!handle.nesCheats) throw new Error("Missing NES port");
            return {
              ...handle,
              nesCheats: {
                ...handle.nesCheats,
                romSha256: "545f33d21ef9804b114d837455fed456fbd6652e76cb520e6458b416426db5c1",
              },
            };
          },
        };
      },
    });
  });
  const cheats = await openTrainer(page);
  const choice = cheats.getByRole("combobox", { name: "Sharaku’s health" });
  await expect(choice).toBeVisible({ timeout: 30000 });
  await expect(choice).toHaveValue("");
  await expect(cheats.locator('input[type="file"]')).toBeHidden();
  await choice.selectOption({ label: "2 bars" });
  await cheats.getByText("Custom codes and tools", { exact: true }).click();
  await cheats.getByLabel("Code", { exact: true }).fill("007A:06");
  await cheats.getByRole("button", { name: "Apply code", exact: true }).click();
  await expect(choice).toHaveValue("007A:06");
  await expect(cheats.getByRole("checkbox")).toHaveCount(1);
  await choice.selectOption({ label: "Off" });
  await expect(cheats.getByRole("checkbox")).toHaveCount(0);
});

test("manages session-only cheats in the NES player", async ({ page }) => {
  const cheats = await openTrainer(page);
  await expect(
    cheats.getByText("This cartridge has no verified presets yet.", { exact: false }),
  ).toBeVisible({ timeout: 30000 });
  await expect(cheats.locator('input[type="file"]')).toBeHidden();
  await cheats.getByText("Custom codes and tools", { exact: true }).click();
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

  await page.setViewportSize({ width: 320, height: 720 });
  const group = Array.from(
    { length: 20 },
    (_, i) => `01${i.toString(16).padStart(2, "0")}:01`,
  ).join("+");
  await files.getByLabel("Open a RetroArch .cht file").setInputFiles({
    name: "group.cht",
    mimeType: "text/plain",
    buffer: Buffer.from(`cheats = 1\ncheat0_desc = "Portable group"\ncheat0_code = "${group}"`),
  });
  await files.getByRole("combobox").selectOption({ label: "Portable group" });
  await files.getByRole("button", { name: "Apply code" }).click();
  const row = panel.getByRole("checkbox", { name: /Portable group/ });
  await expect(row).toBeChecked();
  const content = await panel.evaluate((node) => ({
    right: node.getBoundingClientRect().right,
    width: node.clientWidth,
    scroll: node.scrollWidth,
  }));
  expect(content.right).toBeLessThanOrEqual(320);
  expect(content.scroll).toBeLessThanOrEqual(content.width + 1);
});
