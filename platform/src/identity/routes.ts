import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import type { ServerConfig } from "../server/config.ts";
import type { Identity } from "./auth.ts";

export function registerIdentity(app: FastifyInstance, auth: Identity, config: ServerConfig): void {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    bodyLimit: 16 * 1024,
    async handler(request, reply) {
      // Host and forwarded headers never choose the identity callback origin.
      const url = new URL(request.url, config.origin);
      const headers = fromNodeHeaders(request.headers);
      headers.set("x-retro-client-ip", request.ip);
      reply.header("cache-control", "no-store");
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers,
          ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        }),
      );
      reply.code(response.status);
      for (const [name, value] of response.headers) {
        if (name !== "set-cookie") reply.header(name, value);
      }
      // Set-Cookie cannot be combined into a comma-separated header.
      reply.header("set-cookie", response.headers.getSetCookie());
      return reply.send(await response.text());
    },
  });

  app.get("/api/session", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    return {
      user: session
        ? {
            id: session.user.id,
            name: session.user.name,
            admin: config.adminUserIds.includes(session.user.id),
          }
        : null,
      allowRegistration: config.allowRegistration,
      oidc: Boolean(config.oidc),
    };
  });
}
