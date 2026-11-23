import { expect, test } from "@playwright/test";
import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { openDosWorkspace, writeDosSave } from "./dos-workspace.ts";

test("rotates real DOS captures and cleans history while keeping the running game recoverable", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openDosWorkspace(page, "Runtime retention", "history-runtime");
  const save = page.getByRole("button", { name: "Save to account", exact: true });
  const profiles: Profile[] = await (await page.request.get("/api/profiles")).json();
  const profile = profiles[0];
  if (!profile) throw new Error("Missing runtime profile");
  const history = async (): Promise<Revision[]> =>
    (await page.request.get(`/api/profiles/${profile.id}/revisions`)).json();
  await expect
    .poll(async () => {
      await save.click();
      return (await history())[0]?.manifest.artifacts.some((file) => file.name === "SAVE.DAT");
    })
    .toBe(true);
  const first = (await history())[0];
  if (!first) throw new Error("Missing captured save");
  await page
    .locator(`[data-revision-id="${first.id}"]`)
    .getByRole("button", { name: "Protect", exact: true })
    .click();
  const runtime = page.frames().find((frame) => frame.url().endsWith("/runtime.html"));
  if (!runtime) throw new Error("Missing DOS runtime");
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
  await expect.poll(async () => (await history()).length).toBe(11);
  const before = await history();
  const head = before[0];
  if (!head) throw new Error("Missing current revision");
  expect(before.some((revision) => revision.id === first.id && revision.protected)).toBe(true);
  const bytes = async (id: string) =>
    (await page.request.get(`/api/revisions/${id}/file?name=SAVE.DAT`)).text();
  expect(await bytes(first.id)).toBe("FIRST\r\n");
  expect(await bytes(head.id)).toBe("THIRD\r\n");
  await page.getByRole("button", { name: "Review history cleanup", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete listed history" }).click();
  await expect.poll(async () => (await history()).length).toBe(3);
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
});
