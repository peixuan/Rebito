import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { RuntimeHandle } from "../../client/runtime/types.ts";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { openDosWorkspace, writeDosSave } from "./dos-workspace.ts";

test("replaces real DOS captures and restores a manual backup while keeping the running game recoverable", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const name = `Runtime retention ${randomUUID()}`;
  await openDosWorkspace(page, name, "history-runtime");
  const save = page.getByRole("button", { name: "Save to account", exact: true });
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  const profile = profiles.find((entry) => entry.name === name);
  if (!profile) throw new Error("Missing runtime profile");
  const history = async (): Promise<Revision[]> =>
    (await page.request.get(`/api/profiles/${profile.id}/revisions`)).json();
  const runtime = page.frames().find((frame) => frame.url().endsWith("/runtime.html"));
  if (!runtime) throw new Error("Missing DOS runtime");
  await expect
    .poll(() =>
      runtime.evaluate(async () => {
        const handle = (window as Window & { testHandle?: RuntimeHandle }).testHandle;
        return new TextDecoder().decode(await handle?.files?.read("SAVE.DAT"));
      }),
    )
    .toBe("FIRST\r\n");
  await page.getByRole("button", { name: "Back up current game", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved as a backup");
  const first = (await history()).find((revision) => revision.protected);
  if (!first) throw new Error("Missing captured backup");
  await expect(page.locator(`[data-revision-id="${first.id}"]`)).toContainText("Backup");
  for (let index = 0; index < 12; index++) {
    await writeDosSave(page, index % 2 ? "THIRD" : "SECOND");
    const published = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.status() === 201,
    );
    await save.click();
    await published;
    await expect(page.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled();
    expect(runtime.isDetached()).toBe(false);
  }
  await expect.poll(async () => (await history()).length).toBe(2);
  const before = await history();
  const head = before[0];
  if (!head) throw new Error("Missing current revision");
  expect(before.some((revision) => revision.id === first.id && revision.protected)).toBe(true);
  const bytes = async (id: string) =>
    (await page.request.get(`/api/revisions/${id}/file?name=SAVE.DAT`)).text();
  expect(await bytes(first.id)).toBe("FIRST\r\n");
  expect(await bytes(head.id)).toBe("THIRD\r\n");
  await page.getByRole("button", { name: "Review history cleanup", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Delete listed history" }),
  ).toBeDisabled();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect.poll(async () => (await history()).length).toBe(2);
  expect((await history())[0]?.id).toBe(head.id);
  expect(await bytes(first.id)).toBe("FIRST\r\n");
  expect(await bytes(head.id)).toBe("THIRD\r\n");
  expect(runtime.isDetached()).toBe(false);
  await expect(page.getByRole("button", { name: "Pause game", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(async () => bytes((await history())[0]?.id ?? "")).toBe("THIRD\r\n");
  await page.getByRole("button", { name: "Stop game", exact: true }).click();
  await page
    .locator(`[data-revision-id="${first.id}"]`)
    .getByRole("button", { name: "Restore this revision", exact: true })
    .click();
  await expect.poll(async () => bytes((await history())[0]?.id ?? "")).toBe("FIRST\r\n");
  const backupRow = page.locator(`[data-revision-id="${first.id}"]`);
  await backupRow.getByRole("button", { name: "Remove backup", exact: true }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("eligible for cleanup");
  await confirm.getByRole("button", { name: "Remove backup", exact: true }).click();
  await expect.poll(async () => (await history()).length).toBe(1);
  expect(await bytes((await history())[0]?.id ?? "")).toBe("FIRST\r\n");
});
