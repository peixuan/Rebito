import { expect, test } from "@playwright/test";
import { useSession } from "./session.ts";

test("keeps the selected playthrough and theme when the shelf changes layout", async ({ page }) => {
  await useSession(page.context(), "library");
  await page.goto("/");
  await page.getByLabel("Search games").fill("Koukai2 editor test");
  await page.locator(".shelf-game").first().click();
  const panel = page.getByRole("region", { name: "Personal profiles" });
  await panel.getByLabel("Profile name").fill("Unfinished draft");
  await page.locator(".shelf-game").first().click();
  await expect(page.locator(".profile-dock").getByLabel("Profile name")).toHaveValue(
    "Unfinished draft",
  );
  await page.getByRole("button", { name: "Night view" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.setViewportSize({ width: 320, height: 750 });
  await expect(page.locator(".shelf-grid").getByLabel("Profile name")).toHaveValue(
    "Unfinished draft",
  );
  expect(await page.locator("html").evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(320);
  await page.reload();
  await expect(page.getByRole("button", { name: "Day view" })).toBeVisible();
  await page.locator(".user-menu summary").click();
  await expect(
    page.locator(".account-popover").getByText("library", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".user-menu summary")).toBeFocused();
});

test("keeps a visible game selected when clearing a shelf search resets pagination", async ({
  page,
}) => {
  await useSession(page.context(), "library");
  await page.route("**/api/games", async (route) => {
    const response = await route.fetch();
    const [game] = await response.json();
    const games = Array.from({ length: 26 }, (_, i) => ({
      ...game,
      id: `shelf-${i + 1}`,
      title: `Cartridge ${i + 1}`,
    }));
    await route.fulfill({ response, json: games });
  });
  await page.route("**/api/profiles", (route) =>
    route.fulfill({ json: [{ id: "played", releaseId: "shelf-3", name: "My run" }] }),
  );
  await page.goto("/");
  const cards = page.locator(".shelf-game");
  await expect(cards).toHaveCount(24);
  await expect(cards.first()).toContainText("Cartridge 3");
  await expect(cards.first()).toHaveAccessibleName(/1 personal profile\b/);
  await expect(cards.nth(1)).toContainText("Cartridge 26");
  await expect(cards.nth(1)).toHaveAccessibleName(/0 personal profiles\b/);
  await page.getByRole("button", { name: "Show 2 more" }).click();
  await expect(cards).toHaveCount(26);
  const search = page.getByLabel("Search games");
  await search.fill("Cartridge 1");
  await page
    .getByRole("button")
    .filter({ has: page.getByText("Cartridge 1", { exact: true }) })
    .click();
  const panel = page.getByRole("region", { name: "Personal profiles" });
  await expect(panel.getByRole("heading")).toHaveText("Cartridge 1");
  await search.fill("");
  await expect(cards).toHaveCount(24);
  await expect(panel.getByRole("heading")).toHaveText("Cartridge 3");
});
