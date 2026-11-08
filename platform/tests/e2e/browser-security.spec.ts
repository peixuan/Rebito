import { expect, test } from "@playwright/test";

test("validates features without disabling the Chromium sandbox", async ({ page }) => {
  await page.goto("chrome://version");
  const commandLine = await page.locator("#command_line").textContent();
  expect(commandLine).toBeTruthy();
  const args = (commandLine ?? "").split(/\s+/);
  for (const flag of ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu-sandbox"])
    expect(args, `Browser must not launch with ${flag}`).not.toContain(flag);
});
