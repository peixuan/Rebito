import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { requireAdministrator } from "../identity/administrator.ts";
import type { ServerConfig } from "../server/config.ts";
import { message } from "../shared/messages.ts";
import { ProgressError } from "../storage/revisions.ts";
import type { LocalLibrary } from "./catalog.ts";
import { coverChange, coverPng } from "./cover-image.ts";
import { coverInfo, coverName, replaceCover } from "./covers.ts";
import { assertNoPendingDeletion, pendingDeletions } from "./deletion-records.ts";
import { withLibraryLock } from "./transaction.ts";
import { LibraryError } from "./upload-settings.ts";

export function registerCovers(
  app: FastifyInstance,
  config: ServerConfig,
  library: LocalLibrary,
  database: Pool,
) {
  const directory = join(config.dataDirectory, "library");
  app.get<{ Params: { id: string; version: string } }>(
    "/api/games/:id/cover/:version",
    async (request, reply) => {
      const { id, version } = request.params;
      await library.refresh();
      if (
        !library.get(id) ||
        (await pendingDeletions(database)).some((job) => job.release_id === id) ||
        (await coverInfo(directory, id))?.version !== version
      )
        throw new ProgressError("not_found");
      return reply
        .type("image/png")
        .header("cache-control", "private, no-store")
        .send(await readFile(join(directory, coverName(id))));
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/admin/games/:id/cover",
    {
      onRequest: requireAdministrator(config),
      config: { exclusiveStorage: true },
      bodyLimit: 360 * 1024,
    },
    async (request) => {
      const change = coverChange.safeParse(request.body);
      if (!change.success) throw new LibraryError(message("cover.invalid"));
      await assertNoPendingDeletion(database);
      return withLibraryLock(directory, async () => {
        await library.refresh();
        const id = request.params.id;
        if (!library.get(id)) throw new ProgressError("not_found");
        const { image, expected } = change.data;
        return {
          cover: await replaceCover(
            directory,
            id,
            expected,
            image ? coverPng(image) : null,
            config.minimumFreeBytes,
          ),
        };
      });
    },
  );
}
