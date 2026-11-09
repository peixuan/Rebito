import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Feed this script to `docker compose exec -T app node --input-type=module`.
// An original byte fixture exercises catalog/save persistence, not emulation.
const directory = await mkdtemp("/tmp/container-fixture-");
try {
  const source = join(directory, "fixture.nes");
  const metadata = join(directory, "fixture.json");
  await writeFile(source, Buffer.from("Original container persistence fixture"));
  await writeFile(metadata, JSON.stringify({ title: "Container fixture", system: "nes" }));
  execFileSync(process.execPath, ["dist/library/import-game.js", source, metadata], {
    stdio: "inherit",
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
