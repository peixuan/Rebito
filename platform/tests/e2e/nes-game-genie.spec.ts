import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { RuntimeHandle, RuntimeWindow } from "../../client/runtime/types.ts";
import type { Game } from "../../src/library/catalog.ts";
import { nesFixture } from "../library/nes-fixture.ts";
import { useSession } from "./session.ts";

type ProbeWindow = RuntimeWindow & { nesProbe?: RuntimeHandle };

test("Game Genie changes CPU reads and honors the original-byte condition", async ({ page }) => {
  await useSession(page.context(), "console");
  const games: Game[] = await (await page.request.get("/api/games")).json();
  const fixture = games.find((game) => game.title === "NES runtime test");
  if (!fixture) throw new Error("Missing NES homebrew fixture");
  const rom = nesFixture();
  // At $8000: LDA #$42; STA $FE; JMP $8000. The loop exposes the byte the CPU read.
  rom.set([0xa9, 0x42, 0x85, 0xfe, 0x4c, 0x00, 0x80], 16);
  const game = { ...fixture, sha256: createHash("sha256").update(rom).digest("hex") };
  await page.goto("/runtime.html");
  await page.evaluate(
    async ({ game, bytes }) => {
      const host = window as ProbeWindow;
      if (!host.retroRuntime) throw new Error("Missing runtime host");
      host.nesProbe = await host.retroRuntime.start({
        game,
        gameBytes: new Uint8Array(bytes),
        profileId: "genie-test",
        progress: null,
      });
      if (!host.nesProbe.nesCheats) throw new Error("Missing NES controls");
    },
    { game, bytes: [...rom] },
  );

  async function expectByte(value: number) {
    await expect
      .poll(() => page.evaluate(() => (window as ProbeWindow).nesProbe?.nesCheats?.readRam()[0xfe]))
      .toBe(value);
  }
  async function apply(codes: string[]) {
    await page.evaluate(
      (codes) => (window as ProbeWindow).nesProbe?.nesCheats?.setCodes(codes),
      codes,
    );
  }

  try {
    await expectByte(0x42);
    await apply(["PYAAPA"]); // $8001 = $71 unconditionally.
    await expectByte(0x71);
    await apply(["YLEAPALG"]); // $8001 = $37 only if the original byte is $43.
    await expectByte(0x42);
    await apply(["YLEAPAZG"]); // The same replacement, now comparing against $42.
    await expectByte(0x37);
    await apply([]);
    await expectByte(0x42);
  } finally {
    await page.evaluate(() => (window as ProbeWindow).nesProbe?.stop());
  }
});
