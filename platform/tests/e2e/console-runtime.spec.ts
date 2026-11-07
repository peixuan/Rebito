import { expect, test } from "@playwright/test";
import type { RuntimeHandle, RuntimeWindow } from "../../client/runtime/types.ts";
import type { Game } from "../../src/library/catalog.ts";
import { useSession } from "./session.ts";

for (const variant of ["NES", "NES without battery", "SNES", "GB", "GBA"]) {
  const system = variant.startsWith("NES") ? "NES" : variant;
  const hasBattery = variant !== "NES without battery";
  test(`runs ${variant} and restores its available save formats`, async ({ page }, info) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    await useSession(page.context(), "console");
    const games: Game[] = await (await page.request.get("/api/games")).json();
    const selected = games.find((entry) => entry.title === `${system} runtime test`);
    if (!selected) throw new Error("Missing own console fixture");
    const game: Game = selected;
    type Progress = { kind: "snapshot" | "game-save"; files: { name: string; bytes: number[] }[] };
    async function start(progress: Progress | null) {
      await page.goto("/runtime.html");
      await page.evaluate(
        async ({ game, progress, hasBattery }) => {
          const host = window as RuntimeWindow & { testHandle?: RuntimeHandle };
          if (!host.retroRuntime) throw new Error("Missing runtime host");
          const gameBytes = new Uint8Array(
            await (await fetch(`/api/games/${game.id}/asset`)).arrayBuffer(),
          );
          // Use the same homebrew program with the iNES battery flag removed.
          if (!hasBattery) gameBytes[6] = (gameBytes[6] ?? 0) & ~2;
          host.testHandle = await host.retroRuntime.start({
            game,
            profileId: "console-test",
            gameBytes,
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
        { game, progress, hasBattery },
      );
    }
    async function capture() {
      return page.evaluate(async () => {
        const handle = (window as Window & { testHandle?: RuntimeHandle }).testHandle;
        const progress = await handle?.capture();
        handle?.resume();
        if (!progress) throw new Error("Expected a runtime snapshot");
        return {
          ...progress,
          files: progress.files.map((file) => ({ name: file.name, bytes: [...file.bytes] })),
        };
      });
    }
    async function pixel() {
      return page.evaluate(
        () =>
          new Promise<number[]>((resolve, reject) =>
            requestAnimationFrame(() => {
              const canvas = document.querySelector("canvas");
              const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
              if (!canvas || !gl) return reject(new Error("Expected a real WebGL frame"));
              const rgba = new Uint8Array(4);
              gl.readPixels(
                canvas.width / 2,
                canvas.height / 2,
                1,
                1,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                rgba,
              );
              resolve([...rgba]);
            }),
          ),
      );
    }
    try {
      await start(null);
      if (hasBattery) {
        await expect
          .poll(
            async () => (await capture()).files.find((file) => file.name === "save.srm")?.bytes[0],
          )
          .toBe(0x42);
      }
      const initial = await capture();
      expect(initial.kind).toBe("snapshot");
      expect(
        initial.files.find((file) => file.name === "__runtime/state.bin")?.bytes.length,
      ).toBeGreaterThan(100);
      const native = initial.files.find((file) => file.name === "save.srm");
      if (hasBattery) {
        if (!native) throw new Error("Missing SRAM");
        native.bytes[0] = 0x43;
        await start({ kind: "game-save", files: [native] });
        await expect
          .poll(
            async () => (await capture()).files.find((file) => file.name === "save.srm")?.bytes[0],
          )
          .toBe(0x43);
      } else {
        expect(initial.files.map((file) => file.name)).toEqual(["__runtime/state.bin"]);
      }
      if (system === "NES") {
        await expect
          .poll(async () => {
            const color = await pixel();
            return (color[1] ?? 0) > (color[2] ?? 0);
          })
          .toBe(true);
        await page.locator("canvas").click();
        await page.keyboard.down("z");
        await expect
          .poll(async () => {
            const color = await pixel();
            return (color[2] ?? 0) > (color[1] ?? 0);
          })
          .toBe(true);
        await page.keyboard.up("z");
      }
      const snapshot = await capture();
      if (system === "NES") {
        await start(native ? { kind: "game-save", files: [native] } : null);
        await expect
          .poll(async () => {
            const color = await pixel();
            return (color[1] ?? 0) > (color[2] ?? 0);
          })
          .toBe(true);
      }
      // Boot with different SRAM: $43 must come from the state, not the save file.
      const snapshotSave = snapshot.files.find((file) => file.name === "save.srm");
      if (hasBattery && !snapshotSave) throw new Error("Missing snapshot SRAM");
      if (snapshotSave) snapshotSave.bytes[0] = 0x42;
      await start({ kind: "snapshot", files: snapshot.files });
      if (system === "NES") {
        await expect
          .poll(async () => {
            const color = await pixel();
            return (color[2] ?? 0) > (color[1] ?? 0);
          })
          .toBe(true);
      }
      await expect
        .poll(
          async () => (await capture()).files.find((file) => file.name === "save.srm")?.bytes[0],
        )
        .toBe(hasBattery ? 0x43 : undefined);
      await page.screenshot({ path: info.outputPath("console.png"), animations: "disabled" });
      expect(errors).toEqual([]);
    } finally {
      await info.attach("runtime-errors", { body: errors.join("\n"), contentType: "text/plain" });
    }
  });
}
