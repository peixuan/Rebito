import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdministrator } from "../identity/administrator.ts";
import type { ServerConfig } from "../server/config.ts";
import { message } from "../shared/messages.ts";
import { describeFirmware, storeFirmware } from "./firmware.ts";
import { withCatalog } from "./transaction.ts";
import { gameUploadSchema, LibraryError } from "./upload-settings.ts";

export function registerFirmware(
  app: FastifyInstance,
  config: ServerConfig,
  assertMutable: () => Promise<void>,
) {
  const directory = join(config.dataDirectory, "library");
  const options = { onRequest: requireAdministrator(config), config: { exclusiveStorage: true } };
  app.get("/api/admin/firmware", options, () =>
    withCatalog(directory, () => describeFirmware(directory)),
  );
  app.post("/api/admin/firmware", { ...options, bodyLimit: 180000 }, async (request) => {
    await assertMutable();
    const parsed = z
      .strictObject({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        firmware: gameUploadSchema.shape.firmware.nonoptional(),
      })
      .safeParse(request.body);
    if (!parsed.success) throw new LibraryError(message("library.biosFormat"));
    return storeFirmware(
      directory,
      Buffer.from(parsed.data.firmware, "base64"),
      parsed.data.token,
      config.minimumFreeBytes,
    );
  });
}
