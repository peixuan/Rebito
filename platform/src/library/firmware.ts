import { createHash, randomUUID } from "node:crypto";
import { access, type FileHandle, mkdir, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { message } from "../shared/messages.ts";
import { DiskCapacity } from "../storage/capacity.ts";
import { readDiscFirmware, validateDiscBios } from "./segacd-upload.ts";
import { syncDirectory, withCatalog, withLibraryLock } from "./transaction.ts";
import { LibraryError } from "./upload-settings.ts";

export const firmwareRegions = ["J", "U", "E"] as const;
export type FirmwareRegion = (typeof firmwareRegions)[number];
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

/** Three bounded regional slots; published game archives retain their own immutable BIOS. */
export async function readFirmware(directory: string, region: FirmwareRegion) {
  let handle: FileHandle | undefined;
  try {
    handle = await open(join(directory, "firmware", `bios_CD_${region}.bin`), "r");
    if ((await handle.stat()).size !== 131072)
      throw new LibraryError(message("library.biosFormat"));
    const bytes = await handle.readFile();
    if (validateDiscBios(bytes).region !== region)
      throw new LibraryError(message("library.biosFormat"));
    return bytes;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function selectFirmware(directory: string, region: FirmwareRegion) {
  const bytes = await readFirmware(directory, region);
  if (!bytes) throw new LibraryError(message("library.firmwareRequired", { region }));
  return bytes;
}

/** Caller holds the catalog lock so the token describes one consistent library view. */
export async function describeFirmware(directory: string) {
  const entries = [];
  for (const region of firmwareRegions) {
    const bytes = await readFirmware(directory, region);
    entries.push({ region, sha256: bytes ? digest(bytes) : null });
  }
  return { entries, token: digest(JSON.stringify(entries)) };
}

async function writeFirmware(directory: string, bytes: Buffer, minimumFreeBytes: number) {
  const { name } = validateDiscBios(bytes);
  const destination = join(directory, "firmware");
  const staging = join(directory, ".uploads");
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await mkdir(staging, { recursive: true, mode: 0o700 });
  const temporary = join(staging, `${randomUUID()}.tmp`);
  await new DiskCapacity(minimumFreeBytes).write(staging, bytes.length, async () => {
    try {
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, join(destination, name));
      await syncDirectory(destination);
      await syncDirectory(directory);
    } finally {
      await rm(temporary, { force: true });
    }
  });
}

export async function storeFirmware(
  directory: string,
  bytes: Buffer,
  token: string,
  minimumFreeBytes: number,
) {
  const { region } = validateDiscBios(bytes);
  return withLibraryLock(directory, async () => {
    const current = await describeFirmware(directory);
    if (current.token !== token) throw new LibraryError(message("library.firmwareConflict"), 409);
    if (current.entries.find((entry) => entry.region === region)?.sha256 !== digest(bytes))
      await writeFirmware(directory, bytes, minimumFreeBytes);
    return describeFirmware(directory);
  });
}

/** Startup holds the exclusive activity lease. Adopt existing BIOS files once per region. */
export async function seedFirmware(directory: string, minimumFreeBytes: number) {
  try {
    await access(join(directory, "catalog.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  return withCatalog(directory, async (catalog) => {
    const current = await describeFirmware(directory);
    const missing = new Set(current.entries.filter((entry) => !entry.sha256).map((e) => e.region));
    for (const entry of catalog.games) {
      if (!missing.size) break;
      if (entry.system !== "segacd") continue;
      const bytes = await readDiscFirmware(join(directory, entry.file));
      const { region } = validateDiscBios(bytes);
      if (missing.delete(region)) await writeFirmware(directory, bytes, minimumFreeBytes);
    }
  });
}
