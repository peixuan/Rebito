import { expect, it } from "vitest";
import { KoukaiDocument, modules } from "../../src/editors/koukai2/document.ts";
import { blankItemIds, itemNames } from "../../src/editors/koukai2/items.ts";
import { message } from "../../src/shared/messages.ts";
import { editorFixture } from "./fixture.ts";

it("offers all eight modules and all twenty item positions, preserving unknown items", () => {
  expect(modules.map((module) => module.id)).toEqual([
    "main",
    "persons",
    "companions",
    "sailors",
    "fleet",
    "ship_types",
    "inventory",
    "discoveries",
  ]);
  const bytes = editorFixture();
  const document = new KoukaiDocument(bytes);
  const records = document.records(0, "inventory");
  expect(records).toHaveLength(20);
  expect(records[0]?.summary).toEqual(message("koukai2.unknownItem", { id: 165 }));
  expect(itemNames).toHaveLength(100);
  for (const [id, label] of itemNames.entries()) {
    if (blankItemIds.has(id)) continue;
    const result = document.render(0, { "inventory.19.item": id });
    const expected = new Uint8Array(bytes);
    expected[0x97 + 0x21b3 + 19] = id;
    // Compare every byte without enumerating 329 KiB in JS for each inventory ID.
    expect(Buffer.compare(result, expected), `complete save bytes for item ${id}`).toBe(0);
    expect(new KoukaiDocument(result).records(0, "inventory")[19]?.summary).toBe(label);
  }
  const removed = document.render(0, document.action(0, "inventory.remove", "inventory.0"));
  expect(removed[0x97 + 0x21b3]).toBe(255);
  for (const record of ["inventory.20", "inventory.-1", "inventory.01", "inventory."])
    expect(() => document.action(0, "inventory.remove", record)).toThrow("koukai2.selectItem");
});
it("reveals exactly 540 map bytes and the legacy reward word", () => {
  const bytes = editorFixture(5, 9);
  const base = 0x97 + 9 * 0x8074;
  const document = new KoukaiDocument(bytes);
  let changes = document.action(9, "world.reveal_map", "world.map");
  changes = document.action(9, "world.max_map_reward", "world.map", changes);
  const expected = new Uint8Array(bytes);
  expected.fill(255, base + 0x144, base + 0x144 + 539);
  expected[base + 0x144 + 539] = 0xc0;
  expected.set([0x76, 0x8d], base + 0x36c);
  expect(document.render(9, changes)).toEqual(expected);
  expect(document.records(9, "discoveries")[0]?.fields.every((field) => field.hidden)).toBe(true);
  expect(() => document.action(9, "world.unknown", "world.map")).toThrow(
    "koukai2.unknownWorldAction",
  );
});
it("preserves low bits for all 256 discovery states and all eight bulk-action combinations", () => {
  const actions = ["world.discoverable_all", "world.discovered_all", "world.unreport_all"];
  for (const start of [0, 100, 200]) {
    const bytes = editorFixture();
    for (let id = 0; id < 100; id++) bytes[0x97 + 0x72ee + id * 7] = (start + id) & 255;
    const document = new KoukaiDocument(bytes);
    expect(document.records(0, "discoveries")).toHaveLength(102);
    for (let combination = 0; combination < 8; combination++) {
      let changes = {};
      for (const [bit, action] of actions.entries())
        if (combination & (1 << bit))
          changes = document.action(0, action, "world.discoveries", changes);
      const expected = new Uint8Array(bytes);
      for (let id = 0; id < 100; id++) {
        let value = (start + id) & 255;
        if (combination & 1) value &= 0x7f;
        if (combination & 2) value |= 0x60;
        if (combination & 4) value &= 0xef;
        expected[0x97 + 0x72ee + id * 7] = value;
      }
      expect(document.render(0, changes)).toEqual(expected);
    }
  }
});
