import { expect, test } from "@playwright/test";
import type { Profile } from "../../src/storage/revisions.ts";
import { autosaveWorkspace, type ObservedWindow } from "./autosave-observer.ts";
import { writeDosSave } from "./dos-workspace.ts";

const uploads = "**/api/profiles/*/revisions";

test("unchanged autosaves never pause or compress, and observations are never published", async ({
  page,
}) => {
  const runtime = await autosaveWorkspace(page);
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/revisions$/.test(request.url())) posts++;
  });
  await runtime.tick();
  await expect.poll(runtime.events).toEqual(["readNativeFiles"]);
  await expect(page.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled();
  // A running observation can see a transient write that disappears before capture.
  await runtime.frame.evaluate(() => {
    const handle = (window as ObservedWindow).testHandle;
    if (!handle?.readNativeFiles) throw new Error("Missing native observation");
    const read = handle.readNativeFiles.bind(handle);
    handle.readNativeFiles = async () => {
      const files = await read();
      return files.map((file) => ({ ...file, bytes: Uint8Array.of(99) }));
    };
  });
  await runtime.tick();
  await expect
    .poll(runtime.events)
    .toEqual(["readNativeFiles", "readNativeFiles", "capture", "resume"]);
  await expect(page.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled();
  expect(posts).toBe(0);
  expect(await runtime.savedFile("SAVE.DAT")).toBe("FIRST\r\n");
});

test("plays during admission retries and uploads later writes in the next coherent capture", async ({
  page,
}) => {
  const runtime = await autosaveWorkspace(page);
  await writeDosSave(page, "SECOND");
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bodies: Buffer[] = [];
  await page.route(uploads, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postDataBuffer() ?? Buffer.alloc(0));
    if (bodies.length === 1) {
      await gate;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "retry-after": "1" },
        body: '{"error":"upload_busy"}',
      });
    } else await route.continue();
  });
  await runtime.tick();
  await expect.poll(() => bodies.length).toBe(1);
  await expect.poll(runtime.events).toEqual(["readNativeFiles", "capture", "resume"]);
  await writeDosSave(page, "THIRD");
  release();
  await expect(page.getByRole("status")).toContainText("automatically saved");
  expect(bodies).toHaveLength(2);
  // Fetch may choose a new multipart boundary; the immutable metadata/files must match.
  const normalized = bodies.map((body) =>
    body.toString("latin1").replace(/----WebKitFormBoundary\w+/g, "BOUNDARY"),
  );
  expect(normalized[1]).toBe(normalized[0]);
  expect(await runtime.savedFile("SAVE.DAT")).toBe("SECOND\r\n");
  expect(await runtime.savedFile("slots/INDEX.DAT")).toBe("INDEX FIRST\r\n");
  await page.unroute(uploads);
  await runtime.tick();
  await expect(page.getByRole("status")).toContainText("automatically saved");
  await expect.poll(() => runtime.savedFile("SAVE.DAT")).toBe("THIRD\r\n");
  await page.getByRole("button", { name: "Pause game", exact: true }).click();
  // A user-paused runtime stays paused even when an automatic capture is needed.
  await runtime.frame.evaluate(async () => {
    const files = (window as ObservedWindow).testHandle?.files;
    if (!files) throw new Error("Missing files");
    await files.replace([
      {
        name: "slots/INDEX.DAT",
        previous: await files.read("slots/INDEX.DAT"),
        bytes: new TextEncoder().encode("INDEX SECOND\r\n"),
      },
    ]);
  });
  await runtime.tick();
  await expect.poll(() => runtime.savedFile("slots/INDEX.DAT")).toBe("INDEX SECOND\r\n");
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toBeEnabled();
});

for (const fault of ["read", "capture", "quota", "lost response", "conflict"] as const) {
  test(`pauses and preserves local progress after background ${fault} failure`, async ({
    page,
  }) => {
    const runtime = await autosaveWorkspace(page);
    await writeDosSave(page, "SECOND");
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let posts = 0;
    if (fault === "read" || fault === "capture") {
      await runtime.frame.evaluate((fault) => {
        const handle = (window as ObservedWindow).testHandle;
        if (!handle) throw new Error("Missing runtime");
        handle[fault === "read" ? "readNativeFiles" : "capture"] = async () => {
          throw new Error("Injected filesystem failure");
        };
      }, fault);
    } else {
      await page.route(uploads, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        posts++;
        if (posts > 1) return route.continue();
        await gate;
        if (fault === "quota")
          await route.fulfill({
            status: 507,
            contentType: "application/json",
            body: '{"error":"quota_exceeded"}',
          });
        else if (fault === "lost response") {
          expect((await route.fetch()).status()).toBe(201);
          await route.abort("failed");
        } else await route.continue();
      });
    }
    await runtime.tick();
    let remoteId: string | undefined;
    if (fault !== "read" && fault !== "capture") {
      await expect.poll(() => posts).toBe(1);
      await writeDosSave(page, "THIRD");
      if (fault === "conflict") {
        // Import advances the cloud head while the automatic upload is still pending.
        await page.getByLabel("Save files", { exact: true }).setInputFiles({
          name: "SAVE.DAT",
          mimeType: "application/octet-stream",
          buffer: Buffer.from("REMOTE\r\n"),
        });
        await page.getByRole("button", { name: "Upload save", exact: true }).click();
        await expect.poll(runtime.events).toContain("pause");
        const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
        remoteId = profiles.find((entry) => entry.id === runtime.profile.id)?.headId ?? undefined;
        expect(remoteId).toBeTruthy();
      }
      release();
    }
    const game = page.getByRole("region", { name: "Game window", exact: true });
    await expect(game.getByRole("alert")).toBeVisible();
    await expect.poll(runtime.events).toContain("pause");
    const events = await runtime.events();
    expect(events.at(-1)).toBe("pause");
    expect(runtime.frame.isDetached()).toBe(false);
    await runtime.tick();
    expect(await runtime.events()).toEqual(events);
    expect(
      await runtime.frame.evaluate(async () =>
        new TextDecoder().decode(
          await (window as ObservedWindow).testHandle?.files?.read("SAVE.DAT"),
        ),
      ),
    ).toBe(fault === "read" || fault === "capture" ? "SECOND\r\n" : "THIRD\r\n");
    if (remoteId) {
      expect(
        await (await page.request.get(`/api/revisions/${remoteId}/file?name=SAVE.DAT`)).text(),
      ).toBe("REMOTE\r\n");
      await expect(game.getByRole("button", { name: "Resume game", exact: true })).toBeDisabled();
      await game
        .getByRole("button", { name: "Save local progress as a new profile", exact: true })
        .click();
      await expect(page.getByRole("heading", { name: /Local backup/ })).toBeVisible();
      expect(await runtime.savedFile("SAVE.DAT")).toBe("THIRD\r\n");
    }
  });
}
