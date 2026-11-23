import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idParameters } from "../saves/http-schema.ts";
import type { EditorService } from "./service.ts";

const identifier = z.string().min(1).max(96);
const changes = z
  .record(identifier, z.number().int().safe())
  .refine((value) => Object.keys(value).length <= 6000);
const textChanges = z
  .record(identifier, z.string().max(128))
  .refine((value) => Object.keys(value).length <= 256);
const slot = z.number().int().min(0).max(9);
const file = z.string().min(1).max(240);
const preview = z.strictObject({
  file: file.optional(),
  slot: slot.optional(),
  module: identifier.optional(),
  record: identifier.optional(),
  changes: changes.optional(),
  textChanges: textChanges.optional(),
  action: z.strictObject({ id: identifier, record: identifier }).optional(),
});
const fileEdits = z.strictObject({
  file,
  edits: z
    .array(z.strictObject({ slot, changes, textChanges: textChanges.optional() }))
    .min(1)
    .max(10)
    .refine((edits) => new Set(edits.map((edit) => edit.slot)).size === edits.length),
});
const publish = z.union([
  // Keep already-open clients working while deployment switches to collection requests.
  fileEdits.transform((entry) => ({ files: [entry] })),
  z.strictObject({
    files: z
      .array(fileEdits)
      .min(1)
      .max(127)
      .refine(
        (files) =>
          new Set(files.map((entry) => entry.file.normalize("NFC").toLowerCase())).size ===
          files.length,
      ),
  }),
]);

/** Registered under privateApi: identity/origin checks run before reading bodies. */
export function registerEditors(app: FastifyInstance, service: EditorService): void {
  app.post<{ Params: { id: string } }>(
    "/api/revisions/:id/editor/preview",
    { schema: { params: idParameters }, bodyLimit: 512 * 1024 },
    async (request, reply) => {
      const parsed = preview.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
      return service.preview(request.ownerId, request.params.id, parsed.data);
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/revisions/:id/editor",
    { schema: { params: idParameters }, bodyLimit: 1024 * 1024, config: { rotateHistory: true } },
    async (request, reply) => {
      const parsed = publish.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
      return reply
        .code(201)
        .send(await service.publish(request.ownerId, request.params.id, parsed.data));
    },
  );
}
