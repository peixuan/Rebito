import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { historyPlan, pruneHistory } from "../storage/history.ts";
import { pendingHistoryFiles, reclaimHistory } from "../storage/history-reclamation.ts";
import type { StorageLimits } from "../storage/limits.ts";
import { idParameters } from "./http-schema.ts";

/** Register behind privateApi and the storage activity guard. Cleanup is exclusive. */
export function registerHistory(
  app: FastifyInstance,
  database: Pool,
  directory: string,
  limits: StorageLimits,
) {
  async function reclaim(owner: string) {
    try {
      return await reclaimHistory(database, directory, owner);
    } catch (error) {
      // Metadata already committed. Report pending reclamation, never ask a client
      // to repeat the confirmed deletion or pretend the whole request rolled back.
      app.log.error({ err: error }, "History file reclamation retained for retry");
      return { reclaimedBytes: null, pendingFiles: await pendingHistoryFiles(database, owner) };
    }
  }
  app.get<{ Params: { id: string } }>(
    "/api/profiles/:id/history/preview",
    { schema: { params: idParameters } },
    async (request) => ({
      ...(await historyPlan(database, request.ownerId, limits, request.params.id)).preview,
      pendingFiles: await pendingHistoryFiles(database, request.ownerId),
    }),
  );
  app.post<{ Params: { id: string }; Body: { token: string } }>(
    "/api/profiles/:id/history/cleanup",
    {
      config: { exclusiveStorage: true, rotateHistory: true },
      schema: {
        params: idParameters,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["token"],
          properties: { token: { type: "string", pattern: "^[a-f0-9]{64}$" } },
        },
      },
    },
    async (request) => {
      const preview = await pruneHistory(database, request.ownerId, limits, {
        profileId: request.params.id,
        token: request.body.token,
      });
      return { preview, ...(await reclaim(request.ownerId)) };
    },
  );
  app.post(
    "/api/storage/reclaim",
    {
      config: { exclusiveStorage: true, rotateHistory: true },
      schema: { body: { type: "object", additionalProperties: false } },
    },
    async (request) => reclaim(request.ownerId),
  );
}
