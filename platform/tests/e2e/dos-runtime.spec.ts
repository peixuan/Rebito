import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import type { RuntimeHandle, RuntimeWindow } from "../../client/runtime/types.ts";
import type { Game } from "../../src/library/catalog.ts";
import { useSession } from "./session.ts";

test("runs real DOSBox WASM and reloads edited native bytes over its filesystem overlay", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 800));
  });
  await useSession(page.context(), "dos");
  const games: Game[] = await (await page.request.get("/api/games")).json();
  const selected = games.find((entry) => entry.system === "dos");
  if (!selected) throw new Error("Missing DOS fixture");
  const game: Game = selected;
  const profileId = "dos-runtime-fixture";
  async function start(
    progress: { kind: "filesystem"; files: { name: string; bytes: number[] }[] } | null,
  ) {
    await page.goto("/runtime.html");
    await page.evaluate(
      async ({ game, progress, profileId }) => {
        const host = window as RuntimeWindow & { testHandle?: RuntimeHandle };
        if (!host.retroRuntime) throw new Error("Missing runtime host");
        const response = await fetch(`/api/games/${game.id}/asset`);
        host.testHandle = await host.retroRuntime.start({
          game,
          profileId,
          gameBytes: new Uint8Array(await response.arrayBuffer()),
          progress: progress
            ? {
                ...progress,
                files: progress.files.map((file) => ({
                  ...file,
                  bytes: new Uint8Array(file.bytes),
                })),
              }
            : null,
        });
      },
      { game, progress, profileId },
    );
  }
  async function capture() {
    return page.evaluate(async () => {
      const handle = (window as Window & { testHandle?: RuntimeHandle }).testHandle;
      const progress = await handle?.capture();
      handle?.resume();
      return progress
        ? {
            ...progress,
            files: progress.files.map((file) => ({ name: file.name, bytes: [...file.bytes] })),
          }
        : null;
    });
  }
  try {
    await start(null);
    await expect
      .poll(async () => (await capture())?.files.find((file) => file.name === "SAVE.DAT")?.bytes, {
        timeout: 15_000,
      })
      .toEqual([...Buffer.from("FIRST\r\n")]);
    const saved = await capture();
    expect(saved?.kind).toBe("filesystem");
    expect(saved?.files.some((file) => file.name === "__runtime/filesystem.zip")).toBe(true);
    await page.evaluate(async () => {
      const handle = (window as Window & { testHandle?: RuntimeHandle }).testHandle;
      if (!handle?.files) throw new Error("Missing live file access");
      handle.pause();
      const previous = await handle.files.read("SAVE.DAT");
      await handle.files.replace("SAVE.DAT", previous, new TextEncoder().encode("LIVE\r\n"));
      handle.resume();
    });
    // A DOS command must read the replacement too, not only the host FS API.
    await page.locator("canvas").click();
    await page.keyboard.type("verify", { delay: 60 });
    await page.keyboard.press("Enter", { delay: 150 });
    await expect
      .poll(async () => {
        const overlay = (await capture())?.files.find(
          (file) => file.name === "__runtime/filesystem.zip",
        );
        if (!overlay) return null;
        const files = unzipSync(new Uint8Array(overlay.bytes));
        const copied = Object.entries(files).find(
          ([name]) => name.toLowerCase() === "check.dat",
        )?.[1];
        return copied ? new TextDecoder().decode(copied) : null;
      })
      .toBe("LIVE\r\n");
    const files =
      saved?.files.map((file) =>
        file.name === "SAVE.DAT"
          ? { name: file.name, bytes: [...Buffer.from("SECOND\r\n")] }
          : file,
      ) ?? [];
    await page.screenshot({ path: info.outputPath("dos.png"), animations: "disabled" });
    await page.evaluate(() =>
      (window as Window & { testHandle?: RuntimeHandle }).testHandle?.stop(),
    );
    await start({ kind: "filesystem", files });
    await expect
      .poll(async () => (await capture())?.files.find((file) => file.name === "SAVE.DAT")?.bytes)
      .toEqual([...Buffer.from("SECOND\r\n")]);
    await page.evaluate(() =>
      (window as Window & { testHandle?: RuntimeHandle }).testHandle?.stop(),
    );
  } finally {
    if (!page.isClosed())
      await page.screenshot({ path: info.outputPath("dos-final.png"), animations: "disabled" });
    await info.attach("runtime-errors", { body: errors.join("\n"), contentType: "text/plain" });
  }
});
