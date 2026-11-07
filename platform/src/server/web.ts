import staticFiles from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { browserPolicy } from "./browser-policy.ts";

export function registerWeb(app: FastifyInstance, root: string): void {
  app.register(async (scope) => {
    await scope.register(staticFiles, { root, index: "index.html", dotfiles: "deny", maxAge: 0 });
    scope.get(
      "/runtime.html",
      {
        helmet: { contentSecurityPolicy: { directives: browserPolicy(true) } },
      },
      async (_request, reply) => reply.sendFile("runtime.html"),
    );
  });
}
