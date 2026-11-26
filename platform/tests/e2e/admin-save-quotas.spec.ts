import { expect, test } from "@playwright/test";
import { useSession } from "./session.ts";

test("saves site limits from game management and reloads the persisted value", async ({ page }) => {
  await useSession(page.context(), "admin");
  await page.goto("/");
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  const open = page.getByRole("button", { name: "Save storage limits" });
  await open.click();
  const dialog = page.getByRole("dialog");
  const field = dialog.getByRole("group", { name: "Site limits" }).getByLabel("Save versions");
  const current = await field.inputValue();
  const url = "/api/admin/save-quotas";
  const initial = (await (await page.request.get(url)).json()).settings;
  try {
    await field.fill(String(Number(current) + 1));
    await dialog.getByRole("button", { name: "Save configuration" }).click();
    await expect(dialog).toBeHidden();
    await open.click();
    await expect(field).toHaveValue(String(Number(current) + 1));
    await expect(dialog).toContainText("Host disk reserve");
  } finally {
    const latest = (await (await page.request.get(url)).json()).settings;
    expect(
      (
        await page.request.post(url, {
          headers: { origin: "http://localhost:4317" },
          data: { ...initial, version: latest.version },
        })
      ).status(),
    ).toBe(200);
  }
});
