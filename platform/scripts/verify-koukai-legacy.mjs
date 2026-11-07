import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { KoukaiDocument } from "../src/editors/koukai2/document.ts";

// Private golden files captured by operating the original Dk2Edit.exe on copies.
// This verifier only reads them; commercial saves never enter the repository.
const directory = process.argv[2];
if (!directory)
  throw new Error("Usage: node scripts/verify-koukai-legacy.mjs PRIVATE_CORPUS_DIRECTORY");
const root = resolve(directory);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
let bytes = await readFile(join(root, "baseline.DAT"));
assert.equal(
  digest(bytes),
  "6e87e9dd05b5f68bb1c4b8793227900549b48da122fc84e1af4b9870ac426faf",
  "Unexpected baseline",
);
const stages = [
  { id: "01-main", changes: { money: 1234567 } },
  { id: "02-persons", changes: { "person.0.leadership": 98 } },
  { id: "03-inventory", changes: { "inventory.0.item": 1 } },
  { id: "04-fleet", changes: { "fleet_supply.0.water": 1234, "fleet.0.0.crew": 501 } },
  {
    id: "05-ship-types",
    changes: { "ship_type.0.capacity": 12345, "ship_type.0.min_industry": 123 },
  },
  {
    id: "06-companions",
    changes: { "companion.0.salary": 123, "person.69.loyalty": 98 },
    actions: ["companions.apply_all"],
    record: "companion.0",
  },
  { id: "07-recruit", actions: ["person.recruit"], record: "person.6" },
  { id: "08-map", actions: ["world.reveal_map", "world.max_map_reward"] },
  { id: "09-discoverable", actions: ["world.discoverable_all"] },
  { id: "10-discovered", actions: ["world.discovered_all"] },
  { id: "11-unreport", actions: ["world.unreport_all"] },
  {
    id: "12-dismiss",
    changes: { "person.6.port": 0 },
    actions: ["person.dismiss"],
    record: "person.6",
  },
  { id: "13-hide", actions: ["person.hide"], record: "person.6" },
];
for (const stage of stages) {
  const document = new KoukaiDocument(bytes);
  let changes = stage.changes ?? {};
  for (const action of stage.actions ?? [])
    changes = document.action(0, action, stage.record ?? "", changes);
  bytes = Buffer.from(document.render(0, changes));
  const expected = await readFile(join(root, `${stage.id}-legacy.DAT`));
  assert.ok(bytes.equals(expected), `${stage.id}: whole-file mismatch`);
  console.log(`${stage.id}: all ${bytes.length} bytes match`);
}
assert.equal(
  digest(bytes),
  "bb37c3358ffebe32ad6cc84a95f0482e7be5ee9e29d24e6a8eb94dcc9cdab074",
  "Unexpected final corpus digest",
);
console.log("13/13 legacy whole-file comparisons passed.");
