import { expect, test } from "@playwright/test";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { ps4FixtureRom } from "../library/ps4-fixture.ts";
import { chinese } from "./locales.ts";
import { useSession } from "./session.ts";

test("associates the MD editor and applies bilingual drafts to the paused running game", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await useSession(page.context(), "admin-ps4");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const fixture = ps4FixtureRom();
  fixture[0x8000 + 0xf54c] = 2;
  fixture.set([2, 5, 3, 0, 8, 4, 6], 0x2aa288 + 22 + 11);
  const uploaded = await page.request.post("/api/admin/games", {
    headers: { origin: "http://localhost:4317" },
    multipart: {
      metadata: JSON.stringify({ title: "PS4 memory editor fixture", system: "md" }),
      file: {
        name: "fixture.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(fixture),
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  await page.getByLabel("Search published games").fill("PS4 memory editor fixture");
  await page
    .getByRole("row")
    .filter({ hasText: "PS4 memory editor fixture" })
    .getByRole("button", { name: "Edit configuration" })
    .click();
  await page.getByLabel("Save editor", { exact: true }).click();
  await page.getByRole("option", { name: "Phantasy Star IV (MD)", exact: true }).click();
  await page.getByRole("button", { name: "Save configuration", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await page.getByRole("button", { name: /PS4 memory editor fixture/ }).click();
  await page.getByLabel("Profile name").fill("Memory editing");
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const capture = page.getByRole("button", { name: "Capture for editing", exact: true });
  await expect(capture).toBeEnabled({ timeout: 30_000 });
  await capture.click();
  const editor = page.getByRole("region", { name: "Save editor" });
  await expect(editor).toContainText("Verified with Ken Tse Chinese 1.6");
  await expect(editor.getByLabel("HP", { exact: true })).toHaveValue("40");
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  const profile = profiles.find((entry) => entry.name === "Memory editing");
  if (!profile) throw new Error("Missing profile");
  const history = async (): Promise<Revision[]> =>
    (await page.request.get(`/api/profiles/${profile.id}/revisions`)).json();
  const original = (await history())[0];
  if (!original) throw new Error("Missing captured revision");
  const nativeSave = original.manifest.artifacts.find((file) => file.name === "save.srm");
  expect(nativeSave?.size).toBeGreaterThan(0);
  const nativeBytes = await page.request.get(`/api/revisions/${original.id}/file?name=save.srm`);
  expect(nativeBytes.status()).toBe(200);
  expect((await nativeBytes.body())[0]).toBe(0x42);
  await editor.getByLabel("HP", { exact: true }).fill("-");
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeDisabled();
  await editor.getByLabel("HP", { exact: true }).press("Tab");
  await expect(editor.getByLabel("HP", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Save files", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Stop game", exact: true })).toBeDisabled();
  await editor.getByLabel("HP", { exact: true }).fill("30");
  await editor.getByLabel("HP", { exact: true }).press("Tab");
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(
    page
      .getByRole("region", { name: chinese("editor.title"), exact: true })
      .getByLabel(chinese("phantasyStar4.health"), { exact: true }),
  ).toHaveValue("30");
  await expect(
    page.getByRole("heading", { name: chinese("phantasyStar4.characters.0"), exact: true }),
  ).toBeVisible();
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeDisabled();
  for (const [label, value] of [
    ["Maximum HP", "120"],
    ["HP", "110"],
    ["Maximum TP", "90"],
    ["TP", "80"],
    ["Base Strength", "180"],
    ["Base Mental", "170"],
    ["Base Agility", "160"],
    ["Base Dexterity", "150"],
  ] as const) {
    await editor.getByLabel(label, { exact: true }).fill(value);
    await editor.getByLabel(label, { exact: true }).press("Tab");
    await expect(editor.getByLabel(label, { exact: true })).toHaveValue(value);
  }
  await expect(editor.getByLabel("Target Attack", { exact: true })).toHaveValue("190");
  await expect(editor.getByLabel("Target Defence", { exact: true })).toHaveValue("167");
  await expect(editor.getByLabel("Target Magic defence", { exact: true })).toHaveValue("181");
  await expect(editor).toContainText("Equipment: 2 (Strength) + 8 (Attack) = 10");
  for (const [label, value, base, expected] of [
    ["Target Attack", "9999", "Base Strength", "255"],
    ["Target Attack", "215", "Base Strength", "205"],
    ["Target Defence", "211", "Base Agility", "204"],
    ["Target Magic defence", "222", "Base Mental", "211"],
  ] as const) {
    await editor.getByLabel(label, { exact: true }).fill(value);
    await editor.getByLabel(label, { exact: true }).press("Tab");
    await expect(editor.getByLabel(base, { exact: true })).toHaveValue(expected);
  }
  await editor.getByLabel("Base Strength", { exact: true }).fill("200");
  await editor.getByLabel("Base Strength", { exact: true }).press("Tab");
  await expect(editor.getByLabel("Target Attack", { exact: true })).toHaveValue("210");
  await editor.getByLabel("Target Attack", { exact: true }).fill("215");
  await editor.getByLabel("Target Attack", { exact: true }).press("Tab");
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.locator('[id="field-person.0.attack"]')).toHaveValue("215");
  await expect(page.locator('[id="field-person.0.strength"]')).toHaveValue("205");
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor.getByRole("button", { name: "Techniques and skills", exact: true }).click();
  await editor
    .getByRole("group", { name: "Technique 3", exact: true })
    .getByLabel("Technique", { exact: true })
    .click();
  await page.getByRole("option", { name: "Res", exact: true }).click();
  const skill = editor.getByRole("group", { name: "Skill 3", exact: true });
  await expect(skill.getByLabel("Maximum uses", { exact: true })).toBeDisabled();
  await skill.getByLabel("Skill", { exact: true }).click();
  await page.getByRole("option", { name: "Flaeli", exact: true }).click();
  await expect(skill.getByLabel("Maximum uses", { exact: true })).toBeEnabled();
  await skill.getByLabel("Maximum uses", { exact: true }).fill("60");
  await skill.getByLabel("Maximum uses", { exact: true }).press("Tab");
  await skill.getByLabel("Remaining uses", { exact: true }).fill("45");
  await skill.getByLabel("Remaining uses", { exact: true }).press("Tab");
  await expect(skill.getByLabel("Remaining uses", { exact: true })).toHaveValue("45");
  await skill.getByLabel("Maximum uses", { exact: true }).fill("20");
  await skill.getByLabel("Maximum uses", { exact: true }).press("Tab");
  const cleared = editor.getByRole("group", { name: "Skill 4", exact: true });
  await cleared.getByLabel("Skill", { exact: true }).click();
  await page.getByRole("option", { name: "Disrupt", exact: true }).click();
  await cleared.getByLabel("Maximum uses", { exact: true }).fill("9");
  await cleared.getByLabel("Maximum uses", { exact: true }).press("Tab");
  await cleared.getByLabel("Remaining uses", { exact: true }).fill("3");
  await cleared.getByLabel("Remaining uses", { exact: true }).press("Tab");
  await cleared.getByLabel("Skill", { exact: true }).click();
  await page.getByRole("option", { name: "Empty", exact: true }).click();
  await editor.getByRole("button", { name: "Preview edits", exact: true }).click();
  const preview = page.getByRole("dialog");
  await expect(preview).toContainText("Res");
  await expect(preview).toContainText("Flaeli");
  await expect(preview).toContainText("Base Strength");
  await expect(preview).toContainText("Equipped Strength");
  await expect(preview).toContainText("Target Attack");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await expect(skill.getByLabel("Remaining uses", { exact: true })).toHaveValue("20");
  await expect(cleared.getByLabel("Maximum uses", { exact: true })).toHaveValue("0");
  await expect(editor.getByRole("alert")).not.toBeVisible();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(
    page.getByLabel(chinese("phantasyStar4.technique"), { exact: true }).nth(2),
  ).toContainText(chinese("phantasyStar4.techniques.24"));
  await expect(
    page.getByLabel(chinese("phantasyStar4.skill"), { exact: true }).nth(2),
  ).toContainText(chinese("phantasyStar4.skills.4"));
  await page.getByLabel(chinese("app.language")).selectOption("en");
  await editor.getByRole("button", { name: "Party", exact: true }).click();
  await editor.getByLabel("Meseta", { exact: true }).fill("12345");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved");
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  const edited = (await history())[0];
  expect(edited?.parentId).toBe(original.id);
  expect(edited?.source).toBe("editor");
  expect(edited?.manifest.runtime).toEqual(original.manifest.runtime);
  expect(edited?.manifest.artifacts.find((file) => file.name === "save.srm")).toEqual(nativeSave);
  await page.getByRole("button", { name: "Save to account", exact: true }).click();
  await expect.poll(async () => (await history()).length).toBe(3);
  const captured = (await history())[0];
  const state = await page.request.get(
    `/api/revisions/${captured?.id}/file?name=__runtime%2Fstate.bin`,
  );
  const memory = openSnapshotMemory(new Uint8Array(await state.body()), "genesis_plus_gx").bytes;
  const data = new DataView(memory.buffer);
  expect(data.getUint32(0xf438)).toBe(12345);
  expect(data.getUint16(0xf50e)).toBe(110);
  expect(data.getUint16(0xf510)).toBe(120);
  expect(data.getUint16(0xf512)).toBe(80);
  expect(data.getUint16(0xf514)).toBe(90);
  expect([0x18, 0x1b, 0x1e, 0x21].map((offset) => memory[0xf500 + offset])).toEqual([
    205, 211, 204, 150,
  ]);
  expect([0x24, 0x28, 0x2c].map((offset) => data.getUint16(0xf500 + offset))).toEqual([
    215, 211, 222,
  ]);
  expect(memory[0xf554]).toBe(24);
  expect(memory[0xf564]).toBe(4);
  expect(memory.slice(0xf56e, 0xf570)).toEqual(Uint8Array.of(20, 20));
  expect(memory[0xf565]).toBe(0);
  expect(memory.slice(0xf570, 0xf572)).toEqual(Uint8Array.of(0, 0));

  // A failed post-publication preview must not move the editor back to its old head.
  let published = false;
  let failedPreview = false;
  await page.route("**/api/revisions/*/editor", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    published = true;
    await route.fulfill({ response });
  });
  await page.route("**/api/revisions/*/editor/preview", async (route) => {
    if (published && !failedPreview) {
      failedPreview = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await editor.getByLabel("Meseta", { exact: true }).fill("12400");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("alert")).toBeVisible();
  expect(failedPreview).toBe(true);
  expect(await history()).toHaveLength(4);
  await editor.getByRole("button", { name: "Discard draft and reload", exact: true }).click();
  await editor.getByRole("button", { name: "Party", exact: true }).click();
  await expect(editor.getByLabel("Meseta", { exact: true })).toHaveValue("12400");
  await expect(editor.getByRole("alert")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
