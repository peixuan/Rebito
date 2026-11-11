import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FastifyRequest } from "fastify";
import { discUploadLimits, gameUploadLimits } from "../domain/game-import.ts";
import { message } from "../shared/messages.ts";
import type { DiskCapacity } from "../storage/capacity.ts";
import { type GameUploadSettings, gameUploadSchema, LibraryError } from "./upload-settings.ts";

/** Read bounded settings first, then reserve space for this system through publication. */
export async function receiveGameUpload<T>(
  request: FastifyRequest,
  source: string,
  staging: string,
  capacity: DiskCapacity,
  publish: (settings: GameUploadSettings, filename: string) => Promise<T>,
) {
  const parts = request.parts({
    limits: {
      files: 1,
      fields: 1,
      parts: 2,
      fileSize: discUploadLimits.bytes,
      fieldSize: 256 * 1024,
    },
  });
  let settings: GameUploadSettings;
  try {
    const first = (await parts.next()).value;
    if (
      first?.type !== "field" ||
      first.fieldname !== "metadata" ||
      first.valueTruncated ||
      typeof first.value !== "string"
    )
      throw new Error("Expected metadata first");
    settings = gameUploadSchema.parse(JSON.parse(first.value));
  } catch {
    throw new LibraryError(message("library.metadataFirst"));
  }
  const limits = settings.system === "segacd" ? discUploadLimits : gameUploadLimits;
  const reserve = limits.bytes + 2 * (limits.expanded + 4 * 1024 ** 2);
  return capacity.write(staging, reserve, async () => {
    const part = (await parts.next()).value;
    if (part?.type !== "file" || part.fieldname !== "file" || !part.filename)
      throw new LibraryError(message("library.fileRequired"));
    let size = 0;
    const bounded = new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length;
        callback(
          size > limits.bytes
            ? new LibraryError(
                message("library.uploadSize", { maximum: limits.bytes / 1024 ** 2 }),
                413,
              )
            : null,
          chunk,
        );
      },
    });
    await pipeline(part.file, bounded, createWriteStream(source, { flags: "wx", mode: 0o600 }));
    if (part.file.truncated) throw new LibraryError(message("errors.uploadSize"), 413);
    if (!(await parts.next()).done || (await stat(source)).size === 0)
      throw new LibraryError(message("library.singleFile"));
    return publish(settings, part.filename);
  });
}
