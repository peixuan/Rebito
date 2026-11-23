import multipart from "@fastify/multipart";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { assertProgressManifest, progressLimits } from "../domain/artifacts.ts";
import type { LocalLibrary } from "../library/catalog.ts";
import { pendingDeletions } from "../library/deletion-records.ts";
import { ProgressError } from "../storage/revisions.ts";
import { idParameters, profileBody, restoreBody, uploadMetadata } from "./http-schema.ts";
import type { SaveFile, SaveMetadata, SaveService } from "./service.ts";
import { UploadBusyError, UploadQueue } from "./upload-queue.ts";

type Params = { Params: { id: string } };
type Upload = SaveMetadata & { baseRevision: string | null };
function badRequest(message: string, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

async function readUpload(
  request: FastifyRequest,
): Promise<{ metadata: Upload; files: SaveFile[] }> {
  let metadata: Upload | undefined;
  const files: SaveFile[] = [];
  let total = 0;
  for await (const part of request.parts()) {
    if (part.type === "field") {
      if (
        part.fieldname !== "metadata" ||
        metadata ||
        part.valueTruncated ||
        typeof part.value !== "string"
      )
        throw badRequest("Invalid upload metadata");
      let value: unknown;
      try {
        value = JSON.parse(part.value);
      } catch {
        throw badRequest("Invalid metadata JSON");
      }
      if (!request.validateInput(value, uploadMetadata))
        throw badRequest("Invalid metadata schema");
      metadata = value as Upload;
    } else {
      const bytes = await part.toBuffer();
      total += bytes.byteLength;
      if (total > progressLimits.bytes) throw badRequest("Collection exceeds size limit", 413);
      files.push({ name: part.filename, bytes });
    }
  }
  if (!metadata) throw badRequest("Missing metadata");
  try {
    assertProgressManifest({
      ...metadata,
      artifacts: files.map(({ name, bytes }) => ({
        name,
        size: bytes.byteLength,
        sha256: "0".repeat(64),
      })),
    });
  } catch {
    throw badRequest("Invalid progress collection");
  }
  return { metadata, files };
}

/** Register inside privateApi so user identity and origin checks precede body parsing. */
export async function registerSaves(
  app: FastifyInstance,
  service: SaveService,
  library: LocalLibrary,
  database: Pool,
): Promise<void> {
  await app.register(multipart, {
    preservePath: true,
    limits: {
      files: progressLimits.files,
      fields: 1,
      parts: progressLimits.files + 1,
      fileSize: progressLimits.bytes,
      fieldSize: 4096,
      fieldNameSize: 100,
      headerPairs: 20,
    },
  });
  app.get("/api/profiles", async (request) => service.revisions.list(request.ownerId));
  app.get("/api/storage", async (request) => service.revisions.usage(request.ownerId));
  app.post<{ Body: { releaseId: string; name: string } }>(
    "/api/profiles",
    { schema: { body: profileBody } },
    async (request, reply) => {
      await library.refresh();
      if (
        !library.get(request.body.releaseId) ||
        (await pendingDeletions(database)).some((job) => job.release_id === request.body.releaseId)
      )
        throw new ProgressError("not_found");
      return reply
        .code(201)
        .send(
          await service.revisions.create(
            request.ownerId,
            request.body.releaseId,
            request.body.name,
          ),
        );
    },
  );
  app.get<Params>(
    "/api/profiles/:id/revisions",
    { schema: { params: idParameters } },
    async (request) => service.revisions.history(request.ownerId, request.params.id),
  );
  app.post<Params & { Body: { expected: boolean; protected: boolean } }>(
    "/api/revisions/:id/protection",
    {
      schema: {
        params: idParameters,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["expected", "protected"],
          properties: { expected: { type: "boolean" }, protected: { type: "boolean" } },
        },
      },
    },
    async (request) =>
      service.revisions.protect(
        request.ownerId,
        request.params.id,
        request.body.expected,
        request.body.protected,
      ),
  );
  app.get<Params & { Querystring: { name: string } }>(
    "/api/revisions/:id/file",
    {
      schema: {
        params: idParameters,
        querystring: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string", minLength: 1, maxLength: 240 } },
        },
      },
    },
    async (request, reply) => {
      const bytes = await service.file(request.ownerId, request.params.id, request.query.name);
      return reply
        .type("application/octet-stream")
        .header("content-disposition", "attachment")
        .send(Buffer.from(bytes));
    },
  );
  const uploads = new UploadQueue();
  app.post<Params>(
    "/api/profiles/:id/revisions",
    { schema: { params: idParameters } },
    async (request, reply) => {
      const controller = new AbortController();
      const disconnected = () => controller.abort(badRequest("Upload disconnected", 499));
      reply.raw.once("close", disconnected);
      if (reply.raw.destroyed) disconnected();
      try {
        const revision = await uploads.run(controller.signal, async () => {
          const { metadata, files } = await readUpload(request);
          const { baseRevision, ...progress } = metadata;
          return service.publish(
            request.ownerId,
            request.params.id,
            baseRevision,
            progress,
            files,
            "game",
          );
        });
        return reply.code(201).send(revision);
      } catch (error) {
        // Only admission failures are safe for clients to automatically retry.
        if (error instanceof UploadBusyError)
          return reply.code(503).header("retry-after", "1").send({ error: "upload_busy" });
        throw error;
      } finally {
        reply.raw.off("close", disconnected);
      }
    },
  );
  app.post<Params & { Body: { baseRevision: string | null; revisionId: string } }>(
    "/api/profiles/:id/restore",
    {
      schema: { params: idParameters, body: restoreBody },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await service.restore(
            request.ownerId,
            request.params.id,
            request.body.baseRevision,
            request.body.revisionId,
          ),
        ),
  );
}
