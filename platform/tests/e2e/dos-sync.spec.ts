import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { dosEditorSave } from "../library/dos-editor-fixture.ts";
import { useSession } from "./session.ts";

test("synchronizes live DOS saves and editor updates without restarting the runtime", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 1100 });
  // Observe the real filesystem read-only so synchronization starts after DOS
  // finishes its write, rather than racing the emulator's keyboard queue.
  await page.addInitScript(() => {
    type Ci = { fsReadFile(name: string): Promise<Uint8Array<ArrayBuffer>> };
    type Options = Record<string, unknown> & { onEvent?: (event: string, ci: Ci) => void };
    type Dos = (element: HTMLElement, options: Options) => unknown;
    const host = window as Window & { testDosFiles?: Ci };
    let dos: Dos;
    Object.defineProperty(window, "Dos", {
      configurable: true,
      get: () => dos,
      set(start: Dos) {
        dos = (element, options) =>
          start(element, {
            ...options,
            onEvent(event: string, ci: Ci) {
              if (event === "ci-ready") host.testDosFiles = ci;
              options.onEvent?.(event, ci);
            },
          });
      },
    });
  });
  await useSession(page.context(), "player");
  await page.goto("/");
  await page.getByRole("button", { name: /DOS live edit test/ }).click();
  const profileName = `In-game save synchronization ${test.info().repeatEachIndex}`;
  await page.getByLabel("Profile name").fill(profileName);
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await page
    .getByText(profileName, { exact: true })
    .locator("..")
    .getByRole("button", { name: "Open profile", exact: true })
    .click();
  await page.getByLabel("Save files").setInputFiles({
    name: "KOUKAI2.DAT",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(dosEditorSave(123)),
  });
  await page.getByRole("button", { name: "Upload save", exact: true }).click();
  const editor = page.getByRole("region", { name: "Save editor", exact: true });
  const money = editor.getByLabel("Money", { exact: true });
  await expect(money).toHaveValue("123");
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const refresh = page.getByRole("button", { name: "Synchronize and refresh", exact: true });
  await expect(refresh).toBeEnabled({ timeout: 30_000 });
  const game = page.getByRole("region", { name: "Game window", exact: true });
  const runtime = page.frames().find((frame) => frame.url().endsWith("/runtime.html"));
  if (!runtime) throw new Error("Missing DOS frame");
  async function expectFile(amount: number, name = "KOUKAI2.DAT") {
    await expect
      .poll(() =>
        runtime?.evaluate(async (file) => {
          const host = window as Window & {
            testDosFiles?: { fsReadFile(name: string): Promise<Uint8Array<ArrayBuffer>> };
          };
          const bytes = await host.testDosFiles?.fsReadFile(file);
          if (!bytes) return null;
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          return [...new Uint8Array(digest)]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("");
        }, name),
      )
      .toBe(createHash("sha256").update(dosEditorSave(amount)).digest("hex"));
  }
  async function saveInsideDos(source: string, amount: number, target = "KOUKAI2.DAT") {
    await page.frameLocator("iframe").locator("canvas").click();
    await page.keyboard.type(`copy /y ${source}.DAT ${target.replaceAll("/", "\\")}`, {
      delay: 25,
    });
    await page.keyboard.press("Enter", { delay: 150 });
    await expectFile(amount, target);
  }
  async function downloaded() {
    const url = await page
      .getByRole("link", { name: "KOUKAI2.DAT", exact: true })
      .first()
      .getAttribute("href");
    if (!url) throw new Error("Missing native save download");
    return (await page.request.get(url)).body();
  }
  await saveInsideDos("NEXT", 456);
  await expect(money).toHaveValue("123"); // Still the server version before synchronization.
  await refresh.click();
  await expect(money).toHaveValue("456");
  expect(await downloaded()).toEqual(Buffer.from(dosEditorSave(456)));
  await expect(game.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled();

  await money.fill("999");
  await money.press("Tab");
  await saveInsideDos("FIRST", 123);
  await refresh.click();
  await expect(editor.getByRole("alert").filter({ hasText: "A newer save exists" })).toBeVisible();
  await expect(money).toHaveValue("999");
  await expect(editor.getByRole("button", { name: "Save edits", exact: true })).toBeDisabled();
  expect(await downloaded()).toEqual(Buffer.from(dosEditorSave(123)));
  await editor.getByRole("button", { name: "Discard draft and reload", exact: true }).click();
  await expect(money).toHaveValue("123");

  // Publish edits through the backend, then replace only the native file in place.
  await money.fill("777");
  await money.press("Tab");
  const saveLink = page.getByRole("link", { name: "KOUKAI2.DAT", exact: true });
  await expect(saveLink).toHaveCount(1);
  const beforeEdit = await saveLink.getAttribute("href");
  if (!beforeEdit) throw new Error("Missing DOS working save");
  await editor.getByLabel("File to edit").click();
  await page.getByRole("option", { name: "slots/SECOND.DAT", exact: true }).click();
  await expect(money).toHaveValue("42");
  await money.fill("778");
  await money.press("Tab");
  await editor.getByLabel("File to edit").click();
  await page.getByRole("option", { name: "KOUKAI2.DAT", exact: true }).click();
  await expect(money).toHaveValue("777");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(game.getByRole("status")).toContainText("Edits were written to the game save");
  expect(runtime.isDetached()).toBe(false);
  await expect(game.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled();
  await expectFile(777);
  await expectFile(778, "slots/SECOND.DAT");
  await expect(saveLink).toHaveCount(1);
  await expect(saveLink).not.toHaveAttribute("href", beforeEdit);
  expect((await page.request.get(beforeEdit)).status()).toBe(404);
  await expectFile(123, "FIRST.DAT");
  await expectFile(456, "NEXT.DAT");
  expect(await downloaded()).toEqual(Buffer.from(dosEditorSave(777)));

  // Synthetic adapter metadata exercises the shared UI boundary with a real DOS
  // file change. The companion is checked even though this draft only edits money.
  const previewUrl = "**/api/revisions/*/editor/preview";
  await page.route(previewUrl, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: {
        ...body,
        syncFiles: body.file === "KOUKAI2.DAT" ? [body.file, "slots/SECOND.DAT"] : [body.file],
      },
    });
  });
  const versionsBeforeCompanion = await page
    .getByRole("link", { name: "KOUKAI2.DAT", exact: true })
    .count();
  await money.fill("889");
  await money.press("Tab");
  await editor.getByLabel("File to edit").click();
  await page.getByRole("option", { name: "slots/SECOND.DAT", exact: true }).click();
  await saveInsideDos("FIRST", 123, "slots/SECOND.DAT");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("The in-game save has changed");
  await expectFile(777);
  await expect(page.getByRole("link", { name: "KOUKAI2.DAT", exact: true })).toHaveCount(
    versionsBeforeCompanion,
  );
  await refresh.click();
  await expect(editor.getByRole("alert").filter({ hasText: "A newer save exists" })).toBeVisible();
  await editor.getByRole("button", { name: "Discard draft and reload", exact: true }).click();
  await page.unrouteAll({ behavior: "wait" });
  await editor.getByLabel("File to edit").click();
  await page.getByRole("option", { name: "KOUKAI2.DAT", exact: true }).click();

  await game.getByRole("button", { name: "Pause game", exact: true }).click();
  await money.fill("888");
  await money.press("Tab");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  // The pinned command interface rejects concurrent reads of the same file.
  // Observe after writeback completes, without racing the application's readback.
  await expect(editor.getByRole("status")).toContainText("Edits were saved as a new revision");
  await expectFile(888);
  await expect(game.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();

  // A failed download retains the paused runtime; retry never publishes twice.
  let publications = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/editor")) publications++;
  });
  const fileUrl = "**/api/revisions/*/file?name=KOUKAI2.DAT";
  await page.route(fileUrl, (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await money.fill("999");
  await money.press("Tab");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(
    game.getByRole("button", { name: "Retry edit synchronization", exact: true }),
  ).toBeEnabled();
  await expect(game.getByRole("button", { name: "Save to account", exact: true })).toBeDisabled();
  await expectFile(888);
  expect(runtime.isDetached()).toBe(false);
  await page.unroute(fileUrl);
  await game.getByRole("button", { name: "Retry edit synchronization", exact: true }).click();
  await expect(
    game.getByRole("button", { name: "Retry edit synchronization", exact: true }),
  ).toHaveCount(0);
  await expectFile(999);
  await expect(game.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  expect(publications).toBe(1);

  // Reject an edit before publication when the game has an unsynchronized save.
  await game.getByRole("button", { name: "Resume game", exact: true }).click();
  await saveInsideDos("NEXT", 456);
  await money.fill("333");
  await money.press("Tab");
  await editor.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("The in-game save has changed");
  expect(publications).toBe(1);
  await expectFile(456);
  await refresh.click();
  await expect(editor.getByRole("alert").filter({ hasText: "A newer save exists" })).toBeVisible();
  await editor.getByRole("button", { name: "Discard draft and reload", exact: true }).click();
  await expect(money).toHaveValue("456");

  const versions = page.getByRole("link", { name: "KOUKAI2.DAT", exact: true });
  const lastWorkingSave = await versions.getAttribute("href");
  if (!lastWorkingSave) throw new Error("Missing DOS save before failed synchronization");
  await page.route("**/api/profiles/*/revisions", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"unavailable"}',
      });
    else await route.continue();
  });
  await refresh.click();
  await expect(game.getByRole("alert")).toBeVisible();
  await expect(game.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
  await expect(versions).toHaveAttribute("href", lastWorkingSave);
  await game.getByRole("button", { name: "Stop game", exact: true }).click();
  await expect(game.getByRole("alert")).toBeVisible();
  await expect(page.frameLocator("iframe").locator("canvas")).toBeVisible();
  await page.unroute("**/api/profiles/*/revisions");
  await game.getByRole("button", { name: "Stop game", exact: true }).click();
  await expect(versions).toHaveCount(1);
  await expect(versions).not.toHaveAttribute("href", lastWorkingSave);
  await expect(game.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start game", exact: true })).toBeVisible();
  expect(await downloaded()).toEqual(Buffer.from(dosEditorSave(456)));
});
