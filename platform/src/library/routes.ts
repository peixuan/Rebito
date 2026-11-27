import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { ProgressError } from "../storage/revisions.ts";
import type { LocalLibrary } from "./catalog.ts";
import { withCovers } from "./covers.ts";
import { pendingDeletions } from "./deletion-records.ts";

/** The private API authenticates both catalog metadata and game bytes. */
export function registerLibrary(
  app: FastifyInstance,
  library: LocalLibrary,
  database: Pool,
  directory: string,
): void {
  app.get("/api/games", async () => {
    await library.refresh();
    const pending = new Set((await pendingDeletions(database)).map((job) => job.release_id));
    return withCovers(
      directory,
      library.list().filter((game) => !pending.has(game.id)),
    );
  });
  app.get<{ Params: { id: string } }>("/api/games/:id/asset", async (request, reply) => {
    await library.refresh();
    const game = library.get(request.params.id);
    if (!game || (await pendingDeletions(database)).some((job) => job.release_id === game.id))
      throw new ProgressError("not_found");
    return reply
      .type("application/octet-stream")
      .header("content-length", game.size)
      .header("content-disposition", "attachment")
      .send(library.stream(game.id));
  });
}
