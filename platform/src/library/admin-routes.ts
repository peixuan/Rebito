import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rm, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireAdministrator } from "../identity/administrator.ts";
import type { ServerConfig } from "../server/config.ts";
import { message } from "../shared/messages.ts";
import { DiskCapacity } from "../storage/capacity.ts";
import type { LocalLibrary } from "./catalog.ts";
import { prepareDosUpload } from "./dos-upload.ts";
import { importGame } from "./importer.ts";
import {
  type GameUploadSettings,
  gameUploadLimits,
  gameUploadSchema,
  LibraryError,
} from "./upload-settings.ts";

async function receive(request: FastifyRequest, source: string) {
  let settings: GameUploadSettings | undefined;
  let filename = "";
  for await (const part of request.parts({
    limits: {
      files: 1,
      fields: 1,
      parts: 2,
      fileSize: gameUploadLimits.bytes,
      fieldSize: 64 * 1024,
    },
  })) {
    if (part.type === "field") {
      if (
        part.fieldname !== "metadata" ||
        settings ||
        part.valueTruncated ||
        typeof part.value !== "string"
      )
        throw new LibraryError(message("library.uploadSettingsLegacy"));
      try {
        settings = gameUploadSchema.parse(JSON.parse(part.value));
      } catch {
        throw new LibraryError(message("library.launchSettingsLegacy"));
      }
    } else {
      if (!settings || filename || part.fieldname !== "file")
        throw new LibraryError(message("library.uploadOrderLegacy"));
      filename = part.filename;
      await pipeline(part.file, createWriteStream(source, { flags: "wx", mode: 0o600 }));
      if (part.file.truncated) throw new LibraryError(message("library.uploadSizeLegacy"), 413);
    }
  }
  if (!settings || !filename || (await stat(source)).size === 0)
    throw new LibraryError(message("library.selectUpload"));
  return { settings, filename };
}

async function validateRom(source: string, filename: string, system: string) {
  const extensions: Record<string, string[]> = {
    nes: [".nes"],
    snes: [".sfc", ".smc"],
    gb: [".gb"],
    gba: [".gba"],
  };
  if (!extensions[system]?.includes(extname(filename).toLowerCase()))
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
  } finally {
    await handle.close();
  }
}

/** Scoped under privateApi and multipart registration; only one import runs per app. */
export function registerGameAdministration(
  app: FastifyInstance,
  config: ServerConfig,
  library: LocalLibrary,
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
      games,
      usedBytes: games.reduce((total, game) => total + game.size, 0),
      maximumBytes: config.maximumLibraryBytes,
    };
  });
  app.post("/api/admin/games", { onRequest: authorize }, async (request, reply) => {
    if (busy) return reply.code(503).header("retry-after", "1").send({ error: "upload_busy" });
    busy = true;
    const source = join(staging, `${randomUUID()}.tmp`);
    const prepared = join(staging, `${randomUUID()}.tmp`);
    try {
      await mkdir(staging, { recursive: true, mode: 0o700 });
      // Cover raw upload, repackaging and publication copies, including ZIP headers.
      const reserve = gameUploadLimits.bytes + 2 * (gameUploadLimits.expanded + 4 * 1024 ** 2);
      return await capacity.write(staging, reserve, async () => {
        const { settings, filename } = await receive(request, source);
        let removed: string[] = [];
        if (settings.system === "dos") {
          if (!/\.(zip|jsdos)$/i.test(filename))
            throw new LibraryError(message("library.dosArchive"));
          removed = await prepareDosUpload(source, prepared, settings);
        } else await validateRom(source, filename, settings.system);
        const id = await importGame(
          directory,
          settings.system === "dos" ? prepared : source,
          {
            title: settings.title,
            system: settings.system,
            saveFiles: settings.saveFiles,
          },
          config.maximumLibraryBytes,
        );
        await library.refresh();
        reply.code(201);
        return { game: library.get(id), removed };
      });
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
