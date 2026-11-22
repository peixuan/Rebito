import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { openPromise } from "yauzl";
import { z } from "zod";
import { discUploadLimits, dosExecutablePattern } from "../domain/game-import.ts";
import { message } from "../shared/messages.ts";
import { DiskCapacity } from "../storage/capacity.ts";
import { verifyBios } from "./bios-verification.ts";
import { catalogSchema, type LibraryEntry, releaseId } from "./catalog.ts";
import { parseDosLaunch } from "./dos-launch.ts";
import { prepareDosUpload } from "./dos-upload.ts";
import { selectFirmware } from "./firmware.ts";
import { importGame } from "./importer.ts";
import { inspectDiscFirmware, prepareDiscUpload } from "./segacd-upload.ts";
import { type Catalog, withCatalog, writeCatalog } from "./transaction.ts";
import {
  type GameUploadSettings,
  gameUploadLimits,
  gameUploadSchema,
  LibraryError,
} from "./upload-settings.ts";

export const configurationChange = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  title: gameUploadSchema.shape.title,
  editor: gameUploadSchema.shape.editor.nullable(),
  firmware: gameUploadSchema.shape.firmware,
  useLibraryFirmware: z.boolean().optional(),
  allowUnrecognizedFirmware: z.boolean().optional(),
  launch: z
    .object(gameUploadSchema.shape)
    .pick({ executable: true, arguments: true, cycles: true, saveFiles: true })
    .optional(),
});

export function entryToken(entry: LibraryEntry): string {
  return createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

export function findEntry(catalog: Catalog, id: string) {
  const entry = catalog.games.find((game) => releaseId(game) === id);
  if (!entry) throw new LibraryError(message("library.releaseMissing"), 404);
  return entry;
}

async function inspectConfiguration(directory: string, entry: LibraryEntry) {
  if (entry.system !== "dos") return { settings: null, executables: [], configuration: "" };
  const archive = await openPromise(join(directory, entry.file), {
    lazyEntries: true,
    autoClose: false,
  });
  try {
    if (archive.entryCount > gameUploadLimits.files)
      throw new LibraryError(message("library.configurationFileCount"));
    const executables: string[] = [];
    let configuration = "";
    for await (const member of archive.eachEntry()) {
      if (dosExecutablePattern.test(member.fileName)) executables.push(member.fileName);
      if (member.fileName.toLowerCase() !== ".jsdos/dosbox.conf") continue;
      if (member.uncompressedSize > 65536)
        throw new LibraryError(message("library.configurationSize"));
      const stream = await archive.openReadStreamPromise(member);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of stream) {
        size += chunk.length;
        if (size > 65536) throw new LibraryError(message("library.configurationSize"));
        chunks.push(chunk);
      }
      configuration = Buffer.concat(chunks).toString("utf8");
    }
    return { settings: parseDosLaunch(configuration, entry), executables, configuration };
  } finally {
    archive.close();
  }
}

export async function describeConfiguration(directory: string, id: string) {
  return withCatalog(directory, async (catalog, library) => {
    const entry = findEntry(catalog, id);
    return {
      game: library.get(id),
      token: entryToken(entry),
      ...(await inspectConfiguration(directory, entry)),
      firmware:
        entry.system === "segacd" ? await inspectDiscFirmware(join(directory, entry.file)) : null,
    };
  });
}

/** HTTP callers hold the exclusive online lease. Old releases/profiles remain immutable. */
export async function changeConfiguration(
  directory: string,
  id: string,
  input: unknown,
  maximumBytes: number,
  minimumFreeBytes: number,
) {
  const parsed = configurationChange.safeParse(input);
  if (!parsed.success) throw new LibraryError(message("library.invalidConfiguration"));
  const change = parsed.data;
  const staging = join(directory, ".uploads");
  const prepared = join(staging, `${randomUUID()}.tmp`);
  let settings: GameUploadSettings | undefined;
  try {
    await withCatalog(directory, async (catalog) => {
      const entry = findEntry(catalog, id);
      if (entryToken(entry) !== change.token)
        throw new LibraryError(message("library.configurationConflict"), 409);
      if (change.firmware || change.useLibraryFirmware) {
        if (
          entry.system !== "segacd" ||
          change.launch ||
          (change.firmware && change.useLibraryFirmware)
        )
          throw new LibraryError(message("library.firmwareUnsupported"));
        const current = await inspectDiscFirmware(join(directory, entry.file));
        const bytes = change.useLibraryFirmware
          ? await selectFirmware(directory, current.region)
          : verifyBios(
              Buffer.from(change.firmware ?? "", "base64"),
              change.allowUnrecognizedFirmware,
            );
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (current.sha256 !== hash)
          settings = gameUploadSchema.parse({
            title: change.title,
            system: entry.system,
            firmware: bytes.toString("base64"),
          });
      }
      if (change.launch) {
        const result = gameUploadSchema.safeParse({
          ...change.launch,
          title: change.title,
          system: entry.system,
        });
        if (entry.system !== "dos" || !result.success)
          throw new LibraryError(message("library.invalidLaunch"));
        settings = result.data;
        const current = (await inspectConfiguration(directory, entry)).settings;
        if (
          current &&
          JSON.stringify({ ...current, title: change.title }) === JSON.stringify(settings)
        )
          settings = undefined;
      }
      if (!settings) {
        if (change.editor !== undefined) {
          const editor = change.editor ?? undefined;
          if (!catalogSchema.shape.games.element.safeParse({ ...entry, editor }).success)
            throw new LibraryError(message("library.editorMismatch"));
          if (editor) entry.editor = editor;
          else delete entry.editor;
        }
        entry.title = change.title;
        await writeCatalog(directory, catalog);
        return;
      }
      await mkdir(staging, { recursive: true, mode: 0o700 });
      await new DiskCapacity(minimumFreeBytes).write<unknown>(
        staging,
        2 *
          ((settings.system === "segacd" ? discUploadLimits : gameUploadLimits).expanded +
            4 * 1024 ** 2),
        () =>
          settings?.system === "segacd"
            ? prepareDiscUpload(
                join(directory, entry.file),
                prepared,
                Buffer.from(settings.firmware ?? "", "base64"),
              )
            : prepareDosUpload(
                join(directory, entry.file),
                prepared,
                settings as GameUploadSettings,
              ),
      );
    });
    if (!settings) return id;
    return await importGame(
      directory,
      prepared,
      {
        title: settings.title,
        system: settings.system,
        saveFiles: settings.saveFiles,
        // Only an explicit administrator selection associates a newly derived release.
        editor: change.editor ?? undefined,
      },
      maximumBytes,
    );
  } finally {
    await rm(prepared, { force: true });
  }
}
