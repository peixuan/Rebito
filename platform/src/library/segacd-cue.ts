import { posix } from "node:path";
import type { Entry } from "yauzl";
import { assertArtifactName } from "../domain/artifacts.ts";
import { message } from "../shared/messages.ts";
import { LibraryError } from "./upload-settings.ts";

const invalid = () => new LibraryError(message("library.cueTracks"));
const key = (name: string) => name.normalize("NFC").toLowerCase();

/** Resolve case differences once, then use short ASCII names on every runtime OS. */
export function parseDiscCue(text: string, cueName: string, entries: Map<string, Entry>) {
  const files: { entry: Entry; name: string; sector: number }[] = [];
  const lines: string[] = [];
  let file: (typeof files)[number] | undefined;
  let track = 0;
  let indexed = false;
  let lastIndex = -1;
  let lastFrame = -1;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^REM(?:\s|$)/i.test(line)) continue;
    const member = /^FILE\s+(?:"([^"\r\n]+)"|(\S+))\s+BINARY$/i.exec(line);
    if (member) {
      if (track && !indexed) throw invalid();
      const name = (member[1] ?? member[2] ?? "").replaceAll("\\", "/");
      try {
        assertArtifactName(name);
      } catch {
        throw invalid();
      }
      const entry = entries.get(key(posix.join(posix.dirname(cueName), name)));
      if (!entry || !/\.bin$/i.test(entry.fileName) || files.some((f) => f.entry === entry))
        throw new LibraryError(message("library.cueFiles"));
      file = { entry, name: `track-${String(files.length + 1).padStart(2, "0")}.bin`, sector: 0 };
      files.push(file);
      lastFrame = -1;
      lines.push(`FILE "${file.name}" BINARY`);
      continue;
    }
    const next = /^TRACK\s+(\d{2})\s+(MODE1\/2352|MODE1\/2048|AUDIO)$/i.exec(line);
    if (next) {
      if (!file || (track && !indexed) || Number(next[1]) !== ++track || track > 99)
        throw invalid();
      const mode = next[2]?.toUpperCase();
      if (track === 1 ? mode === "AUDIO" : mode !== "AUDIO") throw invalid();
      const sector = mode === "MODE1/2048" ? 2048 : 2352;
      if (file.sector && file.sector !== sector) throw invalid();
      file.sector = sector;
      if (!file.entry.uncompressedSize || file.entry.uncompressedSize % sector) throw invalid();
      indexed = false;
      lastIndex = -1;
      lines.push(`  TRACK ${next[1]} ${mode}`);
      continue;
    }
    const index = /^(INDEX (0[01])|PREGAP|POSTGAP)\s+(\d{2}):([0-5]\d):([0-7]\d)$/i.exec(line);
    if (index) {
      if (!file?.sector || Number(index[5]) >= 75) throw invalid();
      const frame = Number(index[3]) * 4500 + Number(index[4]) * 75 + Number(index[5]);
      if (index[2]) {
        const number = Number(index[2]);
        if (
          number <= lastIndex ||
          (track === 1 && number === 1 && frame !== 0) ||
          frame < lastFrame ||
          frame >= file.entry.uncompressedSize / file.sector
        )
          throw invalid();
        lastIndex = number;
        lastFrame = frame;
        indexed ||= number === 1;
      }
      lines.push(`    ${line.toUpperCase()}`);
      continue;
    }
    // Non-path metadata cannot introduce extra runtime files or commands.
    if (
      /^(TITLE|PERFORMER|SONGWRITER)\s+"[^"\r\n]*"$/i.test(line) ||
      /^(CATALOG\s+\d{13}|ISRC\s+[A-Z0-9]{12}|FLAGS\s+(?:DCP|PRE|4CH|SCMS)(?:\s+(?:DCP|PRE|4CH|SCMS))*)$/i.test(
        line,
      )
    ) {
      lines.push(line);
      continue;
    }
    throw invalid();
  }
  if (!indexed || !track || files.some((f) => !f.sector)) throw invalid();
  return { text: `${lines.join("\n")}\n`, files };
}
