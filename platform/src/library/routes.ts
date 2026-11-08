import type { FastifyInstance } from "fastify";
import { ProgressError } from "../storage/revisions.ts";
import type { LocalLibrary } from "./catalog.ts";

/** The private API authenticates both catalog metadata and game bytes. */
export function registerLibrary(app: FastifyInstance, library: LocalLibrary): void {
  app.get("/api/games", async () => {
    await library.refresh();
    return library.list();
  });
  app.get<{ Params: { id: string } }>("/api/games/:id/asset", async (request, reply) => {
    await library.refresh();
    const game = library.get(request.params.id);
    if (!game) throw new ProgressError("not_found");
    return reply
      .type("application/octet-stream")
      .header("content-length", game.size)
      .header("content-disposition", "attachment")
      .send(library.stream(game.id));
  });
}
