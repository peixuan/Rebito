import { crc32, deflateSync } from "node:zlib";
import { z } from "zod";
import { message } from "../shared/messages.ts";
import { LibraryError } from "./upload-settings.ts";

export const coverSide = 256;
const side = z.number().int().min(1).max(coverSide);
const pixels = z.strictObject({
  width: side,
  height: side,
  rgba: z.string().max(Math.ceil((coverSide ** 2 * 4) / 3) * 4),
});
export const coverChange = z.strictObject({
  expected: z.string().max(100).nullable(),
  image: pixels.nullable(),
});
type Pixels = z.infer<typeof pixels>;

function chunk(type: string, data: Buffer) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4);
  return out;
}

/** Accept bounded pixels only. The server emits a static PNG without source metadata. */
export function coverPng(image: Pixels) {
  const { width, height, rgba } = image;
  const stride = width * 4;
  const raw = Buffer.from(rgba, "base64");
  if (raw.length !== stride * height || raw.toString("base64") !== rgba)
    throw new LibraryError(message("cover.invalid"));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row++)
    raw.copy(rows, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
