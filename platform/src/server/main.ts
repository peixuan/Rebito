import { createApp } from "./app.ts";

const app = createApp();
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer from 1 to 65535");
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.close().catch((error: unknown) => {
      app.log.error(error, "Shutdown failed");
      process.exitCode = 1;
    });
  });
}

await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
