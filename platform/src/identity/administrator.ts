import type { FastifyReply, FastifyRequest } from "fastify";
import type { ServerConfig } from "../server/config.ts";

/** Register inside privateApi: identity and origin checks must run first. */
export function requireAdministrator(config: Pick<ServerConfig, "adminUserIds">) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.adminUserIds.includes(request.ownerId))
      return reply.code(403).send({ error: "administrator_required" });
  };
}
