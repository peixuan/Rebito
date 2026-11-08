import { expect, test } from "@playwright/test";
import { useSession } from "./session.ts";

test("shows capacity warnings and stale refresh errors without blocking navigation", async ({
  page,
}, info) => {
  await useSession(page.context(), "other");
  // Display boundary only; real quota ownership/publication is covered by API tests.
  let unavailable = false;
  await page.route("**/api/storage", async (route) => {
    await route.fulfill(
      unavailable
        ? { status: 503, json: { error: "internal_error" } }
        : {
            json: {
              used: { bytes: 8192, profiles: 80, revisions: 1600 },
              limits: { bytes: 10240, profiles: 100, revisions: 2000 },
            },
          },
    );
  });
  await page.goto("/");
  const summary = page.getByRole("complementary", { name: "Account usage" });
  await expect(summary.getByRole("alert")).toContainText("80%");
  await expect(summary).toContainText("8.0 KiB / 10.0 KiB");
  unavailable = true;
  await page.getByRole("button", { name: "Refresh usage" }).click();
  await expect(summary.getByRole("alert")).toContainText("may be outdated");
  await expect(summary.getByRole("meter", { name: "Save storage" })).toHaveAttribute(
    "value",
    "8192",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("capacity-mobile.png") });
  await page.unroute("**/api/storage");
  await page.getByRole("button", { name: "Refresh usage" }).click();
  await expect(summary.getByRole("meter", { name: "Save storage" })).toHaveAttribute("value", "0");
  await expect(summary.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(summary).toHaveCount(0);
});
