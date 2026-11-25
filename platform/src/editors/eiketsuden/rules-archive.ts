import { crc32 } from "node:zlib";
import { type Entry, fromBufferPromise, type ZipFile } from "yauzl";
import { type EiketsudenRules, eiketsudenRulesSize, parseEiketsudenRules } from "./rules.ts";

export const eiketsudenArchiveLimit = 64 * 1024 ** 2;

/** Read only the bounded metadata member; never extract or execute game files. */
export async function readEiketsudenRules(bytes: Uint8Array): Promise<EiketsudenRules | undefined> {
  if (bytes.length > eiketsudenArchiveLimit) return;
  let archive: ZipFile | undefined;
  try {
    archive = await fromBufferPromise(Buffer.from(bytes), {
      lazyEntries: true,
      autoClose: false,
      strictFileNames: true,
    });
    if (archive.entryCount > 5000) return;
    let selected: Entry | undefined;
    for await (const entry of archive.eachEntry()) {
      const directory = entry.fileName.endsWith("/");
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (entry.isEncrypted() || (mode && mode !== (directory ? 0o040000 : 0o100000))) return;
      if (entry.fileName.split("/").at(-1)?.toLowerCase() !== "bakdata.r3") continue;
      if (selected || entry.uncompressedSize !== eiketsudenRulesSize) return;
      selected = entry;
    }
    if (!selected) return;
    const content = new Uint8Array(eiketsudenRulesSize);
    const stream = await archive.openReadStreamPromise(selected);
    let size = 0;
    let checksum = 0;
    for await (const chunk of stream) {
      if (size + chunk.length > content.length) return;
      content.set(chunk, size);
      size += chunk.length;
      checksum = crc32(chunk, checksum);
    }
    if (size !== content.length || checksum !== selected.crc32) return;
    return parseEiketsudenRules(content);
  } catch {
    return;
  } finally {
    archive?.close();
  }
}
