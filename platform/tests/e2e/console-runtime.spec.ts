import { expect, test } from "@playwright/test";
import type { RuntimeControl, RuntimeHandle, RuntimeWindow } from "../../client/runtime/types.ts";
import type { Game } from "../../src/library/catalog.ts";
import { useSession } from "./session.ts";

for (const variant of [
  "NES",
  "NES without battery",
  "SNES",
  "GB",
  "GBA",
  "MD",
  "MD-SMD",
  "SMS",
  "GG",
]) {
  const system = variant.startsWith("NES") ? "NES" : variant === "MD-SMD" ? "MD" : variant;
  const hasBattery = variant !== "NES without battery";
  const sega = ["MD", "SMS", "GG"].includes(system);
  test(`runs ${variant} and restores its available save formats`, async ({ page }, info) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    await useSession(page.context(), "console");
    const games: Game[] = await (await page.request.get("/api/games")).json();
    const selected = games.find(
      (entry) => entry.title === `${hasBattery ? variant : system} runtime test`,
    );
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
      const bindings = await page.evaluate(() => {
        let bindings: RuntimeControl[] = [];
        const controls = (window as RuntimeWindow & { testHandle?: RuntimeHandle }).testHandle
          ?.controls;
        if (!controls) throw new Error("Missing controller capability");
        controls.watch((value) => {
          bindings = value;
        })();
        return Object.fromEntries(
          bindings.map(({ button, key }) => [
            typeof button === "string" ? button : button.messageId,
            key,
          ]),
        );
      });
      expect(bindings).toMatchObject({
        "controls.up": "↑",
        "controls.down": "↓",
        "controls.left": "←",
        "controls.right": "→",
      });
      expect(bindings).toMatchObject(
        system === "MD"
          ? { A: "S", B: "X", C: "Z", X: "Q", Y: "A", Z: "E", "controls.mode": "V" }
          : system === "SMS"
            ? { "controls.buttonOneStart": "X", "controls.buttonTwo": "Z" }
            : system === "GG"
              ? { "controls.buttonOne": "X", "controls.buttonTwo": "Z" }
              : { A: "Z", B: "X" },
      );
      if (system !== "SMS") expect(bindings["controls.start"]).toBe("Enter");
      if (system === "SNES") expect(bindings).toMatchObject({ X: "A", Y: "S", L: "Q", R: "E" });
      if (system === "GBA") expect(bindings).toMatchObject({ L: "Q", R: "E" });
      if (system === "MD")
        expect(
          await page
            .locator('.ejs_control_bar[data-index="0"]')
            .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-label"))),
        ).toEqual(expect.arrayContaining(["A", "B", "C", "X", "Y", "Z", "MODE"]));
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
      if (sega) {
        await expect.poll(async () => (await pixel())[2]).toBeGreaterThan(150);
        await page.locator("canvas").click();
        await page.keyboard.press("ArrowRight", { delay: 100 });
        await expect.poll(async () => (await pixel())[0]).toBeGreaterThan(150);
      }
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
      if (sega) await expect.poll(async () => (await pixel())[0]).toBeGreaterThan(150);
      const snapshot = await capture();
      if (system === "NES" || sega) {
        await start(sega ? null : native ? { kind: "game-save", files: [native] } : null);
        await expect
          .poll(async () => {
            const color = await pixel();
            return sega ? (color[2] ?? 0) > (color[0] ?? 0) : (color[1] ?? 0) > (color[2] ?? 0);
          })
          .toBe(true);
      }
      // Genesis Plus GX keeps SRAM outside the state. Other cores restore it.
      // Use different boot SRAM to prove the changed palette comes from the state.
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
      if (sega) await expect.poll(async () => (await pixel())[0]).toBeGreaterThan(150);
      await expect
        .poll(
          async () => (await capture()).files.find((file) => file.name === "save.srm")?.bytes[0],
        )
        .toBe(hasBattery ? (sega ? 0x42 : 0x43) : undefined);
      await page.screenshot({ path: info.outputPath("console.png"), animations: "disabled" });
      expect(errors).toEqual([]);
    } finally {
      await info.attach("runtime-errors", { body: errors.join("\n"), contentType: "text/plain" });
    }
  });
}
