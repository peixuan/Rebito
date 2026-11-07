import Fastify from "fastify";

/** Compose the HTTP service without opening ports so tests exercise real routes. */
export function createApp() {
  const app = Fastify({
    bodyLimit: 1024 * 1024,
    requestTimeout: 30_000,
    logger: {
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
    },
  });

  app.get("/health/live", async () => ({ status: "ok" }));

  app.setErrorHandler((error, _request, reply) => {
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
