import staticFiles from "@fastify/static";
import type { FastifyInstance } from "fastify";

export function registerWeb(app: FastifyInstance, root: string): void {
  app.register(staticFiles, { root, index: "index.html", dotfiles: "deny", maxAge: 0 });
}
