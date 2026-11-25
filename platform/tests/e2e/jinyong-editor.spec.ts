import { expect, test } from "@playwright/test";
import { zipSync } from "fflate";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { jinyongFixture } from "../editors/jinyong-fixture.ts";
import { checkEditorLayout } from "./editor-layout.ts";
import { chinese } from "./locales.ts";
import { useSession } from "./session.ts";

test("associates the original editor and preserves bilingual drafts across native saves", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await useSession(page.context(), "admin-jinyong");
  const upload = await page.request.post("/api/admin/games", {
    headers: { origin: "http://localhost:4317" },
    multipart: {
      metadata: JSON.stringify({
        title: "Jinyong editor test",
        system: "dos",
        executable: "PLAY.BAT",
        saveFiles: [1, 2, 3].flatMap((slot) => ["R", "S", "D"].map((kind) => `${kind}${slot}.GRP`)),
      }),
      file: {
        name: "editor.zip",
        mimeType: "application/zip",
        buffer: Buffer.from(
          zipSync({ "PLAY.BAT": Buffer.from("@echo off\r\necho Synthetic editor test\r\n") }),
        ),
      },
    },
  });
  expect(upload.status()).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "Game management", exact: true }).click();
  await page.getByLabel("Search published games").fill("Jinyong editor test");
  await page
    .getByRole("row")
    .filter({ hasText: "Jinyong editor test" })
    .getByRole("button", { name: "Edit configuration" })
    .click();
  await page.getByLabel("Save editor", { exact: true }).click();
  await page
    .getByRole("option", { name: "Heroes of Jin Yong (original DOS)", exact: true })
    .click();
  await expect(page.getByText(/For the original DOS game, not MODs or remakes/)).toBeVisible();
  await page.getByRole("button", { name: "Save configuration", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toContainText(
    "Jinyong editor test",
  );
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await page.getByRole("button", { name: /Jinyong editor test/ }).click();
  await page.getByLabel("Profile name").fill("Original Jinyong editing");
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  const original = Buffer.from(jinyongFixture());
  original.writeInt16LE(2, 0x360);
  const files = [1, 2, 3].flatMap((slot) => [
    { name: `R${slot}.GRP`, mimeType: "application/octet-stream", buffer: original },
    { name: `S${slot}.GRP`, mimeType: "application/octet-stream", buffer: Buffer.from([slot, 2]) },
    { name: `D${slot}.GRP`, mimeType: "application/octet-stream", buffer: Buffer.from([slot, 3]) },
  ]);
  await page.getByLabel("Save files").setInputFiles(files);
  await page.getByRole("button", { name: "Upload save", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor" });
  const health = editor.getByLabel("Health", { exact: true });
  const sex = editor.getByRole("combobox", { name: "Sex / castration status" });
  await expect(sex).toBeDisabled();
  await expect(sex).toHaveText("Castrated");
  await expect(health).toHaveValue("32");
  expect((await health.boundingBox())?.width).toBeLessThan(150);
  await health.fill("999999");
  await health.press("Tab");
  await expect(health).toHaveValue("999");
  await editor.getByLabel("Maximum health", { exact: true }).fill("999");
  await editor.getByLabel("Maximum health", { exact: true }).press("Tab");
  await editor.getByRole("button", { name: "Learned martial arts", exact: true }).click();
  const firstArt = editor.getByRole("group", { name: "Martial art slot 1", exact: true });
  await expect(editor.getByRole("group", { name: /^Martial art slot \d+$/ })).toHaveCount(10);
  await checkEditorLayout(editor, "martial-arts-en");
  await firstArt.getByLabel("Martial art", { exact: true }).click();
  await page.getByRole("option", { name: "Test92", exact: true }).click();
  await firstArt.getByLabel("Proficiency", { exact: true }).fill("900");
  await firstArt.getByLabel("Proficiency", { exact: true }).press("Tab");
  await editor.getByRole("button", { name: "Inventory and silver", exact: true }).click();
  const owned = editor.getByRole("checkbox", { name: "Owned items only" });
  await expect(owned).toBeChecked();
  await expect(editor.locator(".record-table tbody tr")).toHaveCount(1);
  await expect(
    editor.getByRole("columnheader", { name: "Bag position", exact: true }),
  ).toBeVisible();
  await editor.getByLabel("Quantity", { exact: true }).fill("30001");
  await editor.getByLabel("Quantity", { exact: true }).press("Tab");
  await expect(editor.getByLabel("Quantity", { exact: true })).toHaveValue("30000");
  await editor.getByRole("columnheader", { name: "Quantity", exact: true }).click();
  await editor.getByRole("columnheader", { name: "Quantity", exact: true }).click();
  await expect(editor.locator(".record-table tbody tr").first()).toContainText("Silver");
  await page.getByRole("combobox", { name: "Language" }).selectOption("zh-CN");
  await expect(page.getByLabel(chinese("jinyong.quantity"), { exact: true })).toHaveValue("30000");
  await page.getByRole("combobox", { name: chinese("app.language") }).selectOption("en");
  await editor.getByLabel("File to edit").click();
  await page.getByRole("option", { name: "R2.GRP", exact: true }).click();
  await expect(editor.getByLabel("Quantity", { exact: true })).toHaveValue("100");
  await owned.uncheck();
  await editor.getByLabel("Search records").fill("Test199");
  await editor.getByRole("row").filter({ hasText: "Test199" }).click();
  await editor.getByLabel("Quantity", { exact: true }).fill("8");
  await editor.getByLabel("Quantity", { exact: true }).press("Tab");
  // Navigating validates the addition, then moving it expands into stable draft keys.
  await editor.getByRole("button", { name: "Characters", exact: true }).click();
  await editor.getByRole("button", { name: "Inventory and silver", exact: true }).click();
  await editor.getByRole("button", { name: "Move to top", exact: true }).click();
  await expect(editor.getByLabel("Bag position", { exact: true })).toHaveValue("1");
  await editor.getByLabel("Search records").fill("");
  await owned.check();
  await expect(editor.locator(".record-table tbody tr")).toHaveCount(2);
  // Quantity sorting stays independent of the actual bag positions.
  await expect(editor.locator(".record-table tbody tr").first()).toContainText("Silver");
  await editor.getByRole("columnheader", { name: "Bag position", exact: true }).click();
  await expect(editor.locator(".record-table tbody tr").first()).toContainText("Test199");
  await editor.getByLabel("Bag position", { exact: true }).fill("2");
  await editor.getByLabel("Bag position", { exact: true }).press("Tab");
  await editor.getByRole("button", { name: "Characters", exact: true }).click();
  await editor.getByRole("button", { name: "Inventory and silver", exact: true }).click();
  await editor.getByRole("button", { name: "Move up", exact: true }).click();
  await page.getByRole("combobox", { name: "Language" }).selectOption("zh-CN");
  await expect(page.getByLabel(chinese("jinyong.position"), { exact: true })).toHaveValue("1");
  await page.getByRole("combobox", { name: chinese("app.language") }).selectOption("en");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Edits were saved as a new revision");
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  const profile = profiles.find(({ name }) => name === "Original Jinyong editing");
  const history: Revision[] = await (
    await page.request.get(`/api/profiles/${profile?.id}/revisions`)
  ).json();
  expect(history).toHaveLength(2);
  expect(history[0]?.source).toBe("editor");
  for (const file of files) {
    const expected = Buffer.from(file.buffer);
    if (file.name === "R1.GRP") {
      expected.writeInt16LE(999, 0x366);
      expected.writeInt16LE(999, 0x368);
      expected.writeInt16LE(92, 0x3c2);
      expected.writeInt16LE(900, 0x3d6);
      expected.writeInt16LE(30000, 38);
    }
    if (file.name === "R2.GRP") {
      expected.writeInt16LE(199, 36);
      expected.writeInt16LE(8, 38);
      expected.writeInt16LE(174, 40);
      expected.writeInt16LE(100, 42);
    }
    const response = await page.request.get(
      `/api/revisions/${history[0]?.id}/file?name=${file.name}`,
    );
    expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(expected);
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath("jinyong-editor.png"), animations: "disabled" });
});
