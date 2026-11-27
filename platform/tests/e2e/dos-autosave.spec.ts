import { expect, test } from "@playwright/test";
import { openDosWorkspace, writeDosSave } from "./dos-workspace.ts";

test("autosaves changed DOS files and saves again before returning to the library", async ({
  page,
}) => {
  test.setTimeout(70_000);
  await openDosWorkspace(page, "Autosave validation");
  await writeDosSave(page, "SECOND");
  await expect(page.getByRole("status")).toContainText(
    "Game progress was automatically saved to your account",
    {
      timeout: 40_000,
    },
  );
  const link = page.getByRole("link", { name: "SAVE.DAT", exact: true }).first();
  const saved = await link.getAttribute("href");
  expect((await page.request.get(saved ?? "")).ok()).toBe(true);
  expect(await (await page.request.get(saved ?? "")).text()).toBe("SECOND\r\n");
  await writeDosSave(page, "THIRD");
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await expect(page.getByRole("button", { name: /DOS save test/ })).toBeVisible();
  await page.getByRole("button", { name: /DOS save test/ }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  const latest = await link.getAttribute("href");
  expect(await (await page.request.get(latest ?? "")).text()).toBe("THIRD\r\n");
});

test("keeps a disk-full exit alive, warns on navigation and synchronizes before logout", async ({
  page,
}) => {
  await openDosWorkspace(page, "Failed exit validation");
  await writeDosSave(page, "SECOND");
  await page.route("**/api/profiles/*/revisions", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 507,
          contentType: "application/json",
          body: '{"error":"disk_space_low"}',
        })
      : route.continue(),
  );
  await page.locator(".user-menu summary").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Game window", exact: true }).getByRole("alert"),
  ).toContainText("insufficient disk space");
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  const dialog = page.waitForEvent("dialog");
  const reload = page.reload({ timeout: 2_000 }).catch(() => {});
  const warning = await dialog;
  expect(warning.type()).toBe("beforeunload");
  await warning.dismiss();
  await reload;
  await expect(page.frameLocator("iframe").locator("canvas")).toBeVisible();
  await page.unroute("**/api/profiles/*/revisions");
  let uploaded = false;
  page.on("response", (response) => {
    if (
      response.request().method() === "POST" &&
      /\/profiles\/[^/]+\/revisions$/.test(response.url()) &&
      response.status() === 201
    )
      uploaded = true;
  });
  await page.locator(".user-menu summary").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  expect(uploaded).toBe(true);
});
