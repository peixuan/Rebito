import type { LibraryEntry } from "./catalog.ts";
import { type GameUploadSettings, gameUploadSchema } from "./upload-settings.ts";

/** Only recognize our simple launch sequence; do not guess complex legacy scripts. */
export function parseDosLaunch(
  configuration: string,
  entry: Pick<LibraryEntry, "title" | "system" | "saveFiles">,
): GameUploadSettings | null {
  const sections = configuration.split(/^\s*\[autoexec\]\s*$/im);
  const commands = sections[1]
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (
    !commands ||
    !/^mount c \.$/i.test(commands.shift() ?? "") ||
    !/^c:$/i.test(commands.shift() ?? "")
  )
    return null;
  let directory = "";
  if (/^cd /i.test(commands[0] ?? ""))
    directory = `${commands.shift()?.slice(3).replaceAll("\\", "/")}/`;
  if (commands.length !== 1) return null;
  const [executable, ...args] = (commands[0] ?? "").split(/\s+/);
  const parsed = gameUploadSchema.safeParse({
    title: entry.title,
    system: entry.system,
    saveFiles: entry.saveFiles,
    executable: directory + executable,
    arguments: args.join(" "),
    cycles: configuration.match(/^\s*cycles\s*=\s*(\S+)\s*$/im)?.[1] ?? "auto",
  });
  return parsed.success ? parsed.data : null;
}
