import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { requireAdministrator } from "../identity/administrator.ts";
import type { ServerConfig } from "../server/config.ts";
import type { LocalLibrary } from "./catalog.ts";
import { changeConfiguration, describeConfiguration } from "./configuration.ts";

export function registerConfiguration(
  app: FastifyInstance,
  config: ServerConfig,
  library: LocalLibrary,
  assertMutable: () => Promise<void>,
) {
  const options = { onRequest: requireAdministrator(config), config: { exclusiveStorage: true } };
  const directory = join(config.dataDirectory, "library");
  app.get<{ Params: { id: string } }>("/api/admin/games/:id/configuration", options, (request) =>
    describeConfiguration(directory, request.params.id),
  );
  app.post<{ Params: { id: string } }>(
    "/api/admin/games/:id/configuration",
    options,
    async (request) => {
      await assertMutable();
      const id = await changeConfiguration(
        directory,
        request.params.id,
        request.body,
        config.maximumLibraryBytes,
        config.minimumFreeBytes,
      );
      await library.refresh();
      return { game: library.get(id), created: id !== request.params.id };
    },
  );
}
