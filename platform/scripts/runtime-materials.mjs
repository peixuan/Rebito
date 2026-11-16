import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const maximumBytes = 4 * 1024 * 1024;
const evidenceKinds = new Set(["release-source", "embedded-revision", "candidate-build-recipe"]);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function archiveSetDigest(lock) {
  const archives = lock.packages.map(({ id, integrity }) => [id, integrity]);
  archives.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return digest(JSON.stringify(archives));
}

/** Validate review inputs before any download or output-path construction. */
export function validateMaterials(manifest, lock) {
  if (manifest.version !== 1 || manifest.archiveSetSha256 !== archiveSetDigest(lock)) {
    throw new Error("Runtime source review does not match the locked archives");
  }
  if (!Array.isArray(manifest.components) || !manifest.components.length) {
    throw new Error("Missing runtime source records");
  }
  const ids = new Set();
  for (const component of manifest.components) {
    if (
      typeof component.id !== "string" ||
      !/^[a-z0-9-]+$/.test(component.id) ||
      ids.has(component.id) ||
      !/^[\w.-]+\/[\w.-]+$/.test(component.repository) ||
      component.repository.split("/").some((part) => part === "." || part === "..") ||
      !/^[a-f0-9]{40}$/.test(component.revision) ||
      !evidenceKinds.has(component.evidence)
    ) {
      throw new Error("Invalid or duplicate runtime source record");
    }
    ids.add(component.id);
    if (!Array.isArray(component.materials) || !component.materials.length) {
      throw new Error("Missing runtime license/build materials");
    }
    const paths = new Set();
    for (const material of component.materials) {
      const segments = material.path?.split("/") ?? [];
      if (
        !segments.length ||
        segments.some(
          (segment) => !/^[\w.-]+$/.test(segment) || segment === "." || segment === "..",
        ) ||
        paths.has(material.path) ||
        !/^[a-f0-9]{64}$/.test(material.sha256)
      ) {
        throw new Error("Invalid or duplicate runtime material path/hash");
      }
      paths.add(material.path);
    }
  }
}

async function downloadMaterial(url, download) {
  const response = await download(url, {
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
    headers: { Accept: "application/vnd.github.raw+json" },
  });
  if (!response.ok || !response.body)
    throw new Error(`Runtime material download failed: ${response.status}`);
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > maximumBytes) throw new Error("Runtime material exceeds size limit");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

/** Preserve verified upstream bytes; never execute downloaded build recipes. */
export async function installMaterials(manifest, lock, cache, output, download = fetch) {
  validateMaterials(manifest, lock);
  await mkdir(cache, { recursive: true });
  await mkdir(output, { recursive: true });
  await rm(join(output, "inventory.json"), { force: true });
  let useContentsApi = false;
  for (const component of manifest.components) {
    for (const material of component.materials) {
      const cached = join(cache, `${material.sha256}.txt`);
      let bytes;
      try {
        bytes = await readFile(cached);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        const url = `https://raw.githubusercontent.com/${component.repository}/${component.revision}/${material.path}`;
        const api = `https://api.github.com/repos/${component.repository}/contents/${material.path}?ref=${component.revision}`;
        try {
          bytes = await downloadMaterial(useContentsApi ? api : url, download);
        } catch (failure) {
          // Some networks block GitHub's raw domain. The official contents API
          // supplies the same pinned bytes; integrity failures never fall back.
          if (
            useContentsApi ||
            (!(failure instanceof TypeError) && failure.name !== "TimeoutError")
          )
            throw failure;
          useContentsApi = true;
          bytes = await downloadMaterial(api, download);
        }
      }
      if (bytes.length > maximumBytes || digest(bytes) !== material.sha256) {
        throw new Error(`Runtime material integrity mismatch: ${component.id}/${material.path}`);
      }
      const temporary = `${cached}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, bytes);
        await rename(temporary, cached);
      } finally {
        await rm(temporary, { force: true });
      }
      // Content-addressed text files remain downloadable without exposing hidden
      // paths such as .github or serving upstream build code as executable JS.
      await writeFile(join(output, `${material.sha256}.txt`), bytes);
    }
  }
  const retained = new Set(
    manifest.components.flatMap((entry) => entry.materials.map((file) => `${file.sha256}.txt`)),
  );
  for (const name of await readdir(output)) {
    if (/^[a-f0-9]{64}\.txt$/.test(name) && !retained.has(name)) await rm(join(output, name));
  }
  await writeFile(
    join(output, "README.txt"),
    "Pinned upstream license and build review materials.\n" +
      "These are not complete corresponding source or permission to distribute binaries.\n" +
      "The project's runtime source review records unresolved distribution blockers.\n",
  );
  // Write the inventory last: a failed download must never look like a completed review.
  await writeFile(join(output, "inventory.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}
