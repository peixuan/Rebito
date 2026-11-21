import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import type { RuntimeHandle, RuntimeWindow } from "../../client/runtime/types.ts";
import type { Game } from "../../src/library/catalog.ts";
import { type AudioProbeWindow, observeDosAudio } from "./audio-probe.ts";
import { useSession } from "./session.ts";

for (const outputRate of [44100, 48000]) {
  test(`paces real DOS audio without queue overflow at ${outputRate} Hz`, async ({ page }) => {
    test.setTimeout(60_000);
    await useSession(page.context(), "dos");
    await observeDosAudio(page, outputRate);
    const games: Game[] = await (await page.request.get("/api/games")).json();
    const game = games.find((entry) => entry.system === "dos");
    if (!game) throw new Error("Missing DOS fixture");
    // Original 8086 program: set PIT channel 2 to ~440 Hz, enable the PC speaker,
    // then wait for a key. No third-party game or executable is distributed.
    const tone = Uint8Array.from([
      0xb0, 0xb6, 0xe6, 0x43, 0xb8, 0x98, 0x0a, 0xe6, 0x42, 0x88, 0xe0, 0xe6, 0x42, 0xe4, 0x61,
      0x0c, 0x03, 0xe6, 0x61, 0xb4, 0x00, 0xcd, 0x16, 0xcd, 0x20,
    ]);
    async function start(explicit: boolean) {
      const configuration = [
        "[cpu]",
        "cycles=10000",
        ...(explicit ? ["[mixer]", "rate=44100", "[MIXER]", "prebuffer=40"] : []),
        "[autoexec]",
        "mount c .",
        "c:",
        "config -get mixer prebuffer > VALUE.DAT",
        "tone.com",
        "",
      ].join("\n");
      const bytes = zipSync({ ".jsdos/dosbox.conf": strToU8(configuration), "tone.com": tone });
      await page.goto("/runtime.html");
      await page.evaluate(
        async ({ game, bytes }) => {
          const host = window as RuntimeWindow & { testHandle?: RuntimeHandle };
          if (!host.retroRuntime) throw new Error("Missing runtime host");
          host.testHandle = await host.retroRuntime.start({
            game: { ...game, saveFiles: ["VALUE.DAT"] },
            profileId: "audio-test",
            gameBytes: new Uint8Array(bytes),
            progress: null,
          });
        },
        { game: game as Game, bytes: [...bytes] },
      );
      await page.locator("canvas").click();
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const handle = (window as Window & { testHandle?: RuntimeHandle }).testHandle;
            return new TextDecoder().decode(await handle?.files?.read("VALUE.DAT")).trim();
          }),
        )
        .toBe(explicit ? "40" : "0");
    }
    await start(false);
    await expect
      .poll(() => page.evaluate(() => (window as AudioProbeWindow).audioSamples.length), {
        timeout: 30_000,
      })
      .toBeGreaterThan(20);
    const samples = await page.evaluate(() => (window as AudioProbeWindow).audioSamples);
    const first = samples[3];
    const last = samples.at(-1);
    if (!first || !last) throw new Error("Missing audio observations");
    expect(last.sourceRate).toBe(44100);
    expect(last.outputRate).toBe(outputRate);
    const rate = (last.samples - first.samples) / (last.time - first.time);
    expect(rate).toBeGreaterThan(43500);
    expect(rate).toBeLessThan(44700);
    expect(last.drops - first.drops).toBe(0);
    expect(last.underflows - first.underflows).toBe(0);
    await page.evaluate(() =>
      (window as Window & { testHandle?: RuntimeHandle }).testHandle?.stop(),
    );
    // Repeated/case-insensitive sections must retain the administrator's override.
    await start(true);
    await page.evaluate(() =>
      (window as Window & { testHandle?: RuntimeHandle }).testHandle?.stop(),
    );
  });
}
