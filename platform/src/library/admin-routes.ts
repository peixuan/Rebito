import { randomUUID } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import type { FastifyInstance } from "fastify";
import { type GameSystem, gameSystems } from "../domain/systems.ts";
import { listEditors } from "../editors/registry.ts";
import { requireAdministrator } from "../identity/administrator.ts";
import type { ServerConfig } from "../server/config.ts";
import { message } from "../shared/messages.ts";
import { DiskCapacity } from "../storage/capacity.ts";
import { verifyBios } from "./bios-verification.ts";
import type { LocalLibrary } from "./catalog.ts";
import { withCovers } from "./covers.ts";
import { prepareDosUpload } from "./dos-upload.ts";
import { selectFirmware } from "./firmware.ts";
import { importGame } from "./importer.ts";
import { receiveGameUpload } from "./receive-upload.ts";
import { validateSegaRom } from "./sega-rom.ts";
import { prepareDiscUpload } from "./segacd-upload.ts";
import { LibraryError } from "./upload-settings.ts";

async function validateRom(source: string, filename: string, system: GameSystem) {
  if (!gameSystems[system].extensions.includes(extname(filename).toLowerCase()))
    throw new LibraryError(message("library.romExtension"));
  const handle = await open(source, "r");
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header);
    if (
      bytesRead < 16 ||
      header.subarray(0, 2).toString() === "PK" ||
      (system === "nes" && !header.subarray(0, 4).equals(Buffer.from([0x4e, 0x45, 0x53, 0x1a])))
    )
      throw new LibraryError(message("library.gameFormat"));
    if (system === "md" || system === "sms" || system === "gg")
      await validateSegaRom(handle, system, extname(filename).toLowerCase());
  } finally {
    await handle.close();
  }
}

/** Scoped under privateApi and multipart registration; only one import runs per app. */
export function registerGameAdministration(
  app: FastifyInstance,
  config: ServerConfig,
  library: LocalLibrary,
  assertMutable: () => Promise<void>,
) {
  const authorize = requireAdministrator(config);
  const directory = join(config.dataDirectory, "library");
  const staging = join(directory, ".uploads");
  const capacity = new DiskCapacity(config.minimumFreeBytes);
  let busy = false;
  app.get("/api/admin/games", { onRequest: authorize }, async () => {
    await library.refresh();
    const games = library.list();
    return {
      games: await withCovers(directory, games),
      editors: listEditors(),
      usedBytes: games.reduce((total, game) => total + game.size, 0),
      maximumBytes: config.maximumLibraryBytes,
    };
  });
  app.post("/api/admin/games", { onRequest: authorize }, async (request, reply) => {
    await assertMutable();
    if (busy) return reply.code(503).header("retry-after", "1").send({ error: "upload_busy" });
    busy = true;
    const source = join(staging, `${randomUUID()}.tmp`);
    const prepared = join(staging, `${randomUUID()}.tmp`);
    try {
      await mkdir(staging, { recursive: true, mode: 0o700 });
      return await receiveGameUpload(
        request,
        source,
        staging,
        capacity,
        async (settings, filename) => {
          let removed: string[] = [];
          if (settings.system === "dos") {
            if (!/\.(zip|jsdos)$/i.test(filename))
              throw new LibraryError(message("library.dosArchive"));
            removed = await prepareDosUpload(source, prepared, settings);
          } else if (settings.system === "segacd") {
            if (!/\.zip$/i.test(filename)) throw new LibraryError(message("library.discArchive"));
            await prepareDiscUpload(
              source,
              prepared,
              settings.firmware
                ? verifyBios(
                    Buffer.from(settings.firmware, "base64"),
                    settings.allowUnrecognizedFirmware,
                  )
                : (region) => selectFirmware(directory, region),
            );
          } else await validateRom(source, filename, settings.system);
          const id = await importGame(
            directory,
            settings.system === "dos" || settings.system === "segacd" ? prepared : source,
            {
              title: settings.title,
              system: settings.system,
              saveFiles: settings.saveFiles,
              editor: settings.editor,
            },
            config.maximumLibraryBytes,
          );
          await library.refresh();
          reply.code(201);
          return { game: library.get(id), removed };
        },
      );
    } catch (error) {
      if (error instanceof LibraryError && error.statusCode === 409)
        throw new LibraryError(message("library.duplicateRelease"), 409);
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new LibraryError(message("library.busy"), 409);
      throw error;
    } finally {
      try {
        await Promise.all([rm(source, { force: true }), rm(prepared, { force: true })]);
      } finally {
        busy = false;
      }
    }
  });
}
