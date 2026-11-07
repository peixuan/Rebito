import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { useSession } from "./session.ts";

test("publishes a console snapshot and resumes it through the same-page workspace", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await useSession(page.context(), "console");
  await page.goto("/");
  await page
    .getByRole("button")
    .filter({ has: page.getByText("NES runtime test", { exact: true }) })
    .click();
  const profileName = `Console cloud save ${randomUUID()}`;
  await page.getByLabel("Profile name").fill(profileName);
  await page.getByRole("button", { name: "Create profile" }).click();
  await page
    .locator(".profile-row")
    .filter({ has: page.getByText(profileName, { exact: true }) })
    .getByRole("button", { name: "Open profile" })
    .click();
  const start = page.getByRole("button", { name: "Start game" });
  const save = page.getByRole("button", { name: "Save to account" });
  await start.click();
  await expect(save).toBeEnabled({ timeout: 30_000 });
  const frame = page.frameLocator("iframe");
  await frame.locator("canvas").click();
  await page.keyboard.press("z", { delay: 100 });
  await save.click();
  await expect(page.getByRole("status")).toContainText("saved to your account");
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  const profile = profiles.find((value) => value.name === profileName);
  if (!profile) throw new Error("Missing player profile");
  const revisions: Revision[] = await (
    await page.request.get(`/api/profiles/${profile.id}/revisions`)
  ).json();
  expect(revisions[0]?.manifest.kind).toBe("snapshot");
  expect(revisions[0]?.manifest.runtime?.core).toBe("fceumm");
  expect(revisions[0]?.manifest.artifacts.map((file) => file.name)).toEqual([
    "save.srm",
    "__runtime/state.bin",
  ]);
  await page.getByRole("button", { name: "Stop game" }).click();
  await expect(start).toBeVisible();
  const stopped: Revision[] = await (
    await page.request.get(`/api/profiles/${profile.id}/revisions`)
  ).json();
  expect(stopped.length).toBe(revisions.length + 1);
  expect(stopped[0]?.parentId).toBe(revisions[0]?.id);
  await start.click();
  await expect(save).toBeEnabled();
  await expect(frame.locator("canvas")).toBeVisible();
  await save.click();
  await expect(page.getByRole("status")).toContainText("saved to your account");
  const resumed: Revision[] = await (
    await page.request.get(`/api/profiles/${profile.id}/revisions`)
  ).json();
  expect(resumed[0]?.parentId).toBe(stopped[0]?.id);
  const native = await page.request.get(`/api/revisions/${resumed[0]?.id}/file?name=save.srm`);
  expect((await native.body())[0]).toBe(0x42);
  await page.getByRole("button", { name: "Stop game" }).click();
  expect(errors).toEqual([]);
});
