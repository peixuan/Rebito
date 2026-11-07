import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { x } from "tar";

export function verifyArchive(bytes, integrity) {
  const actual = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  if (actual !== integrity) throw new Error("Runtime archive integrity mismatch");
}

/** Download verified archives only; never execute upstream install/build scripts. */
export async function installRuntime(record, cache, output, download = fetch) {
  await mkdir(cache, { recursive: true });
  const archive = join(cache, `${record.id}.tgz`);
  let bytes;
  try {
    bytes = await readFile(archive);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const response = await download(record.url, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok) throw new Error(`Runtime download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    verifyArchive(bytes, record.integrity);
    const temporary = `${archive}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, archive);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  verifyArchive(bytes, record.integrity);
  const unpacked = await mkdtemp(join(resolve(cache), "unpack-"));
  try {
    await x({
      file: archive,
      cwd: unpacked,
      strict: true,
      filter: (_path, entry) => entry.type === "File" || entry.type === "Directory",
    });
    const root = join(unpacked, "package");
    const target = join(output, record.target);
    await mkdir(target, { recursive: true });
    if (record.core) {
      for (const name of await readdir(root)) {
        if (name.endsWith(".data") || name === "reports") {
          await cp(join(root, name), join(target, name), { recursive: true });
        }
      }
    } else await cp(join(root, record.from), target, { recursive: true });
    const notices = join(output, "notices", record.id);
    await mkdir(notices, { recursive: true });
    for (const name of await readdir(root)) {
      if (/^(license|copying|readme|package\.json)/i.test(name)) {
        await cp(join(root, name), join(notices, name), { recursive: true });
      }
    }
  } finally {
    // mkdtemp returned this absolute child of our private build cache.
    await rm(unpacked, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lock = JSON.parse(await readFile("runtime-lock.json", "utf8"));
  const output = resolve(".runtime-cache/public/runtimes");
  for (const record of lock.packages) {
    await installRuntime(record, resolve(".runtime-cache/archives"), output);
    console.log(`Verified runtime: ${record.id}`);
  }
  await writeFile(join(output, "inventory.json"), `${JSON.stringify(lock, null, 2)}\n`);
}
