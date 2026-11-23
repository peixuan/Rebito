import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const original = "this.targetFrames = Math.max(1024, Math.round(this.outputRate * 2048 / 44100));";
const buffered = original.replace("2048", "4410");
const sourcePath = "src/dos/dosbox/ts/audio-worklet.ts";
export const audioVariant = "rebito-audio-buffer-100ms-v1";

/** Patch only the reviewed queue target; equal-width edits preserve source mappings. */
export function bufferDosAudio(script, map) {
  const index = map.sources.indexOf(sourcePath);
  if (index < 0 || map.sources.lastIndexOf(sourcePath) !== index)
    throw new Error("Pinned DOS audio source map changed");
  const source = map.sourcesContent[index];
  if (
    typeof source !== "string" ||
    [script, source].some((text) => text.split(original).length !== 2)
  )
    throw new Error("Pinned DOS audio buffer changed");
  const updated = structuredClone(map);
  updated.sourcesContent[index] = source.replace(original, buffered);
  return { script: script.replace(original, buffered), map: updated };
}

/** Called only after runtime-assets has verified the pinned upstream archive. */
export async function installDosAudioBuffer(target, variant) {
  if (variant !== audioVariant) throw new Error("Unreviewed DOS audio variant");
  const path = join(target, "emulators", "emulators.js");
  const script = await readFile(path, "utf8");
  const map = JSON.parse(await readFile(`${path}.map`, "utf8"));
  const patched = bufferDosAudio(script, map);
  await writeFile(path, patched.script);
  await writeFile(`${path}.map`, JSON.stringify(patched.map));
  await writeFile(
    join(target, "AUDIO-MODIFICATION.txt"),
    [
      "Rebito modification, 2026-11-23: browser audio target buffer is 100 ms.",
      "Upstream: js-dos 8.5.3 / emulators 8.5.2; upstream notices still apply.",
      "Only the targetFrames constant changes from 2048 to 4410 (at 44100 Hz).",
      `Modified preferred source: emulators/emulators.js.map, ${sourcePath}.`,
      "Reproduce: platform/scripts/runtime-audio.mjs via npm run runtimes.",
      `Runtime variant: ${variant}.`,
      "",
    ].join("\n"),
  );
}
