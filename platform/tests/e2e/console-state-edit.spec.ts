import { expect, test } from "@playwright/test";
import type { RuntimeHandle, RuntimeProgress, RuntimeWindow } from "../../client/runtime/types.ts";
import { openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import type { Game } from "../../src/library/catalog.ts";
import { useSession } from "./session.ts";

type SerializedProgress = Omit<RuntimeProgress, "files"> & {
  files: { name: string; bytes: number[] }[];
};

for (const system of ["md", "segacd"] as const) {
  test(`confirms a ${system} memory edit without changing native saves`, async ({ page }) => {
    test.setTimeout(60_000);
    await useSession(page.context(), "console");
    const games: Game[] = await (await page.request.get("/api/games")).json();
    const game = games.find((entry) => entry.system === system);
    if (!game) throw new Error("Missing console fixture");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/runtime.html");
    await page.evaluate(async (game) => {
      const host = window as RuntimeWindow & { testHandle?: RuntimeHandle };
      if (!host.retroRuntime) throw new Error("Missing runtime host");
      host.testHandle = await host.retroRuntime.start({
        game,
        profileId: "memory-edit-test",
        gameBytes: new Uint8Array(await (await fetch(`/api/games/${game.id}/asset`)).arrayBuffer()),
        progress: null,
      });
    }, game);
    const capture = () =>
      page.evaluate(async (): Promise<SerializedProgress> => {
        const handle = (window as Window & { testHandle?: RuntimeHandle }).testHandle;
        const progress = await handle?.snapshot?.read();
        if (!progress) throw new Error("Missing snapshot edit capability");
        return {
          ...progress,
          files: progress.files.map((file) => ({ name: file.name, bytes: [...file.bytes] })),
        };
      });
    const previous = await capture();
    const native = previous.files.find((file) => file.name === "save.srm");
    expect(native?.bytes.length).toBeGreaterThan(0);
    const state = previous.files.find((file) => file.name === "__runtime/state.bin");
    if (!state) throw new Error("Missing state");
    const core = system === "md" ? "genesis_plus_gx" : "picodrive";
    const memory = openSnapshotMemory(new Uint8Array(state.bytes), core);
    // This RAM is unused by the original fixture, so advancing a frame cannot rewrite it.
    memory.bytes[0x4000] = 0x9b;
    memory.bytes[0x4001] = 0x12;
    const next = {
      ...previous,
      files: previous.files.map((file) =>
        file.name === state.name ? { ...file, bytes: [...memory.replace(memory.bytes)] } : file,
      ),
    };
    await page.evaluate(
      async ({ previous, next }) => {
        const access = (window as Window & { testHandle?: RuntimeHandle }).testHandle?.snapshot;
        if (!access) throw new Error("Missing snapshot edit capability");
        const decode = (value: SerializedProgress): RuntimeProgress => ({
          ...value,
          files: value.files.map((file) => ({ ...file, bytes: new Uint8Array(file.bytes) })),
        });
        await access.replace(decode(previous), decode(next));
      },
      { previous, next },
    );
    const result = await capture();
    expect(result.files.find((file) => file.name === "save.srm")).toEqual(native);
    const changed = result.files.find((file) => file.name === state.name);
    if (!changed) throw new Error("Missing applied state");
    expect([
      ...openSnapshotMemory(new Uint8Array(changed.bytes), core).bytes.slice(0x4000, 0x4002),
    ]).toEqual([0x9b, 0x12]);
    expect(await capture()).toEqual(result);
    expect(errors).toEqual([]);
  });
}
