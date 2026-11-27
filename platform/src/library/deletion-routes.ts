import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { requireAdministrator } from "../identity/administrator.ts";
import type { ServerConfig } from "../server/config.ts";
import { message } from "../shared/messages.ts";
import type { LocalLibrary } from "./catalog.ts";
import { findEntry } from "./configuration.ts";
import { coverInfo } from "./covers.ts";
import {
  assertNoPendingDeletion,
  beginDeletion,
  deletionImpact,
  pendingDeletions,
} from "./deletion-records.ts";
import { reclaimDeletion } from "./reclamation.ts";
import { withCatalog } from "./transaction.ts";
import { LibraryError } from "./upload-settings.ts";

const confirmation = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().min(1).max(120),
  deleteSaves: z.boolean(),
});

export function registerDeletions(
  app: FastifyInstance,
  config: ServerConfig,
  library: LocalLibrary,
  database: Pool,
) {
  const options = { onRequest: requireAdministrator(config), config: { exclusiveStorage: true } };
  app.get("/api/admin/deletions", { onRequest: requireAdministrator(config) }, async () =>
    (await pendingDeletions(database)).map(({ preview }) => preview),
  );
  app.get<{ Params: { id: string } }>("/api/admin/games/:id/deletion", options, async (request) => {
    const pending = (await pendingDeletions(database)).find(
      (job) => job.release_id === request.params.id,
    );
    if (pending) return { ...pending.preview, pending: true };
    return withCatalog(
      join(config.dataDirectory, "library"),
      async (catalog) =>
        (
          await deletionImpact(
            database,
            catalog,
            findEntry(catalog, request.params.id),
            await coverInfo(join(config.dataDirectory, "library"), request.params.id),
          )
        ).preview,
    );
  });
  app.post<{ Params: { id: string } }>(
    "/api/admin/games/:id/deletion",
    options,
    async (request, reply) => {
      const parsed = confirmation.safeParse(request.body);
      if (!parsed.success) throw new LibraryError(message("library.invalidDeletion"));
      let job = (await pendingDeletions(database)).find(
        (entry) => entry.release_id === request.params.id,
      );
      if (job) {
        if (
          parsed.data.token !== job.preview.token ||
          parsed.data.title !== job.preview.title ||
          (job.preview.profiles > 0 && !parsed.data.deleteSaves)
        )
          throw new LibraryError(message("library.cleanupConfirmation"), 409);
      } else {
        await assertNoPendingDeletion(database);
        job = await withCatalog(join(config.dataDirectory, "library"), async (catalog) =>
          beginDeletion(
            database,
            catalog,
            findEntry(catalog, request.params.id),
            parsed.data,
            await coverInfo(join(config.dataDirectory, "library"), request.params.id),
          ),
        );
      }
      try {
        const result = await reclaimDeletion(database, config.dataDirectory, job);
        await library.refresh();
        return result;
      } catch (error) {
        app.log.error({ err: error }, "Game reclamation needs retry");
        return reply.code(202).send({
          status: "pending",
          ...job.preview,
          displayMessage: message("library.cleanupPending"),
        });
      }
    },
  );
}
