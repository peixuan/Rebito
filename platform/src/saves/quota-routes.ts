import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { requireAdministrator } from "../identity/administrator.ts";
import type { ServerConfig } from "../server/config.ts";
import { quotaSchema, quotaSettings, updateQuotas } from "../storage/quota-settings.ts";
import { siteUsage } from "../storage/site-quota.ts";

export function registerSaveQuotas(app: FastifyInstance, config: ServerConfig, database: Pool) {
  const url = "/api/admin/save-quotas";
  const onRequest = requireAdministrator(config);
  const readSettings = async () => ({
    settings: await quotaSettings(database, config.storageLimits, config.siteSaveLimits),
    used: await siteUsage(database),
    reserveBytes: config.minimumFreeBytes,
  });
  app.get(url, { onRequest }, readSettings);
  app.post(url, { onRequest, config: { exclusiveStorage: true } }, async (request, reply) => {
    const parsed = quotaSchema
      .extend({ version: z.number().int().nonnegative() })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const { version, ...limits } = parsed.data;
    if ((await updateQuotas(database, version, limits)) === undefined)
      return reply.code(409).send({ error: "conflict" });
    return readSettings();
  });
}
