import rateLimit from "@fastify/rate-limit";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import type { Identity } from "./auth.ts";

declare module "fastify" {
  interface FastifyRequest {
    ownerId: string;
  }
}

/** Authenticate before reading request bodies and authorize mutations by exact origin. */
export function privateApi(
  app: FastifyInstance,
  auth: Identity,
  origin: string,
  routes: (scope: FastifyInstance) => Promise<void>,
): void {
  app.register(async (scope) => {
    scope.decorateRequest("ownerId", "");
    scope.addHook("onRequest", async (request, reply) => {
      reply.header("cache-control", "no-store");
      const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
      if (!session) return reply.code(401).send({ error: "unauthenticated" });
      request.ownerId = session.user.id;
      if (!["GET", "HEAD"].includes(request.method) && request.headers.origin !== origin) {
        return reply.code(403).send({ error: "invalid_origin" });
      }
    });
    await scope.register(rateLimit, {
      max: 240,
      timeWindow: "1 minute",
      keyGenerator: (request) => request.ownerId,
    });
    await routes(scope);
  });
}
