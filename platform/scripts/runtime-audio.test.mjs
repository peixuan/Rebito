import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { audioVariant, bufferDosAudio, installDosAudioBuffer } from "./runtime-audio.mjs";

const original = "this.targetFrames = Math.max(1024, Math.round(this.outputRate * 2048 / 44100));";
const map = {
  version: 3,
  sources: ["src/dos/dosbox/ts/audio-worklet.ts", "unrelated.ts"],
  sourcesContent: [`// upstream notice\n${original}`, "unchanged"],
  mappings: "AAAA",
};
const script = `/* upstream notice */\n${original}\n// unchanged`;

it("keeps notices, unrelated source and mapping coordinates while increasing the target", () => {
  const patched = bufferDosAudio(script, map);
  expect(patched.script).toBe(script.replace("2048", "4410"));
  expect(patched.script.length).toBe(script.length);
  expect(patched.map).toEqual({
    ...map,
    sourcesContent: [map.sourcesContent[0].replace("2048", "4410"), "unchanged"],
  });
  expect(map.sourcesContent[0]).toContain("2048");
});

it("rejects drift, duplicate matches and already patched inputs", () => {
  for (const input of ["missing", script + original, script.replace("2048", "4410")])
    expect(() => bufferDosAudio(input, map)).toThrow("buffer changed");
  for (const sourcesContent of [["missing"], [original + original], [null]])
    expect(() => bufferDosAudio(script, { ...map, sourcesContent })).toThrow("buffer changed");
  for (const sources of [[], [map.sources[0], map.sources[0]]])
    expect(() => bufferDosAudio(script, { ...map, sources })).toThrow("source map changed");
});

it("validates both files before writing and records the applied modification", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rebito-audio-"));
  try {
    await mkdir(join(directory, "emulators"));
    const path = join(directory, "emulators", "emulators.js");
    await writeFile(path, script);
    await writeFile(`${path}.map`, JSON.stringify({ ...map, sources: [] }));
    await expect(installDosAudioBuffer(directory, "unknown")).rejects.toThrow("variant");
    await expect(installDosAudioBuffer(directory, audioVariant)).rejects.toThrow("source map");
    expect(await readFile(path, "utf8")).toBe(script);
    await writeFile(`${path}.map`, JSON.stringify(map));
    await installDosAudioBuffer(directory, audioVariant);
    expect(await readFile(path, "utf8")).toBe(script.replace("2048", "4410"));
    expect(JSON.parse(await readFile(`${path}.map`, "utf8"))).toEqual(
      bufferDosAudio(script, map).map,
    );
    expect(await readFile(join(directory, "AUDIO-MODIFICATION.txt"), "utf8")).toContain(
      audioVariant,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
