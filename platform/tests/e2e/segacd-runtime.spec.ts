import { expect, test } from "@playwright/test";
import type { RuntimeControl, RuntimeHandle, RuntimeWindow } from "../../client/runtime/types.ts";
import type { Game } from "../../src/library/catalog.ts";
import { useSession } from "./session.ts";

test("boots original CD firmware and restores native backup RAM and a visible snapshot", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await useSession(page.context(), "console");
  const games: Game[] = await (await page.request.get("/api/games")).json();
  const game = games.find((g) => g.system === "segacd");
  if (!game) throw new Error("Missing original CD fixture");
  type Capture = { kind: "snapshot" | "game-save"; files: { name: string; bytes: number[] }[] };
  async function start(progress: Capture | null) {
    await page.goto("/runtime.html");
    await page.evaluate(
      async ({ game, progress }) => {
        const host = window as RuntimeWindow & { handle?: RuntimeHandle };
        if (!host.retroRuntime) throw new Error("Missing runtime host");
        host.handle = await host.retroRuntime.start({
          game,
          profileId: "cd-test",
          gameBytes: new Uint8Array(
            await (await fetch(`/api/games/${game.id}/asset`)).arrayBuffer(),
          ),
          progress: progress
            ? {
                ...progress,
                files: progress.files.map((f) => ({ ...f, bytes: new Uint8Array(f.bytes) })),
              }
            : null,
        });
      },
      { game: game as Game, progress },
    );
  }
  async function capture() {
    return page.evaluate(async () => {
      const handle = (window as Window & { handle?: RuntimeHandle }).handle;
      const result = await handle?.capture();
      handle?.resume();
      if (!result) throw new Error("Missing CD snapshot");
      return { ...result, files: result.files.map((f) => ({ name: f.name, bytes: [...f.bytes] })) };
    });
  }
  async function pixel() {
    return page.evaluate(
      () =>
        new Promise<number[]>((resolve) =>
          requestAnimationFrame(() => {
            const canvas = document.querySelector("canvas");
            const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
            if (!canvas || !gl) throw new Error("Missing rendered CD frame");
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
  await start(null);
  const bindings = await page.evaluate(() => {
    let bindings: RuntimeControl[] = [];
    const controls = (window as RuntimeWindow & { handle?: RuntimeHandle }).handle?.controls;
    if (!controls) throw new Error("Missing CD controls");
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
    A: "S",
    B: "X",
    C: "Z",
    X: "Q",
    Y: "A",
    Z: "E",
    "controls.mode": "V",
    "controls.start": "Enter",
  });
  await expect.poll(async () => (await pixel())[2]).toBeGreaterThan(150);
  const native = (await capture()).files.find((f) => f.name === "save.srm");
  expect(native?.bytes.length).toBe(73728);
  if (!native) throw new Error("Missing CD backup RAM");
  expect(native.bytes[0x2000]).toBe(0x42);
  expect(native.bytes[0x11fff]).toBe(0x55);
  expect(native.bytes.filter((byte) => byte !== 0)).toHaveLength(2);
  native.bytes[0x2000] = 0x43;
  await start({ kind: "game-save", files: [native] });
  await expect.poll(async () => (await pixel())[0]).toBeGreaterThan(150);
  expect((await capture()).files.find((f) => f.name === "save.srm")?.bytes[0x2000]).toBe(0x43);
  await start(null);
  await expect.poll(async () => (await pixel())[2]).toBeGreaterThan(150);
  await page.locator("canvas").click();
  await page.keyboard.press("ArrowRight", { delay: 100 });
  await expect.poll(async () => (await pixel())[0]).toBeGreaterThan(150);
  const state = await capture();
  expect(state.runtime?.core).toBe("picodrive");
  await start(null);
  await expect.poll(async () => (await pixel())[2]).toBeGreaterThan(150);
  await start({ kind: "snapshot", files: state.files });
  await expect.poll(async () => (await pixel())[0]).toBeGreaterThan(150);
  expect((await capture()).files.find((f) => f.name === "save.srm")?.bytes[0x2000]).toBe(0x42);
});
