import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { zipSync } from "fflate";
import { z } from "zod";
import { assertArtifactName } from "../src/domain/artifacts.ts";

const specificationSchema = z.strictObject({
  configuration: z.string().min(1),
  files: z.array(z.string().min(1)).min(1).max(5000),
});
const limit = 512 * 1024 * 1024;
function isChild(root, path) {
  const child = relative(root, path);
  return child && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

/** An explicit allowlist prevents accidentally collecting saves or unrelated tools. */
export async function bundleDos(source, specificationPath, output) {
  const specification = specificationSchema.parse(
    JSON.parse(await readFile(specificationPath, "utf8")),
  );
  const root = await realpath(source);
  const destination = join(await realpath(dirname(resolve(output))), basename(output));
  if (destination === root || isChild(root, destination))
    throw new Error("Output must be outside the source game directory");
  const configPath = resolve(dirname(specificationPath), specification.configuration);
  if ((await stat(configPath)).size > 32768) throw new Error("DOS configuration exceeds 32 KiB");
  const configuration = await readFile(configPath);
  if (!/^\[autoexec\]\s*$/im.test(configuration.toString("utf8")))
    throw new Error("DOS configuration needs an [autoexec] section");
  const files = Object.create(null);
  files[".jsdos/dosbox.conf"] = configuration;
  const names = new Set();
  let size = configuration.length;
  for (const name of [...specification.files].sort()) {
    assertArtifactName(name);
    const canonical = name.normalize("NFC").toLowerCase();
    if (canonical === ".jsdos" || canonical.startsWith(".jsdos/") || names.has(canonical))
      throw new Error("Duplicate or reserved bundle path");
    if (
      [...names].some(
        (other) => canonical.startsWith(`${other}/`) || other.startsWith(`${canonical}/`),
      )
    )
      throw new Error("Bundle path is both a file and directory");
    names.add(canonical);
    const path = await realpath(join(root, name));
    if (!isChild(root, path)) throw new Error("Source file escapes the game directory");
    const details = await stat(path);
    if (!details.isFile() || details.size + size > limit)
      throw new Error("Bundle source exceeds limits");
    const bytes = await readFile(path);
    size += bytes.length;
    if (size > limit) throw new Error("Bundle source exceeds limits");
    files[name] = bytes;
  }
  const bundle = zipSync(files, { level: 6, mtime: new Date(1980, 0, 1) });
  if (bundle.length > limit) throw new Error("Compressed bundle exceeds 512 MiB");
  await writeFile(destination, bundle, { flag: "wx", mode: 0o600 });
  return bundle.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, specification, output, ...extra] = process.argv.slice(2);
  if (!source || !specification || !output || extra.length)
    throw new Error("Usage: bundle-dos.mjs SOURCE_DIRECTORY SPECIFICATION_JSON OUTPUT.jsdos");
  console.log(`Created ${await bundleDos(source, specification, output)} byte DOS bundle.`);
}
