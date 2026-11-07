import helmet from "@fastify/helmet";
import Fastify from "fastify";
import { ProgressError } from "../storage/revisions.ts";
import { browserPolicy } from "./browser-policy.ts";

/** Compose the HTTP service without opening ports so tests exercise real routes. */
export function createApp() {
  const app = Fastify({
    bodyLimit: 1024 * 1024,
    requestTimeout: 30_000,
    logger: {
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
    },
  });
  app.register(helmet, {
    crossOriginEmbedderPolicy: { policy: "require-corp" },
    contentSecurityPolicy: {
      directives: browserPolicy(),
    },
  });

  app.get("/health/live", async () => ({ status: "ok" }));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ProgressError) {
      const status = { not_found: 404, conflict: 409, release_mismatch: 400 }[error.code];
      return reply.code(status).send({ error: error.code });
    }
    const candidate =
      error instanceof Error && "statusCode" in error ? error.statusCode : undefined;
    const status =
      typeof candidate === "number" &&
      Number.isInteger(candidate) &&
      candidate >= 400 &&
      candidate <= 599
        ? candidate
        : 500;
    if (status >= 500) app.log.error({ err: error }, "Request failed");
    reply.code(status).send({ error: status >= 500 ? "internal_error" : "invalid_request" });
  });

  return app;
}
