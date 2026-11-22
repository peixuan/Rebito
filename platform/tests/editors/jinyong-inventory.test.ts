import { expect, it } from "vitest";
import { JinyongDocument } from "../../src/editors/jinyong/document.ts";
import { editInventory, inventoryField } from "../../src/editors/jinyong/inventory.ts";
import { jinyongFixture } from "./jinyong-fixture.ts";

it("updates silver at its actual bag entry without treating byte 42 as money", () => {
  const original = jinyongFixture();
  const data = new DataView(original.buffer);
  data.setInt16(40, 2, true);
  data.setInt16(42, 7, true);
  const expected = new Uint8Array(original);
  new DataView(expected.buffer).setInt16(38, 30_000, true);
  const result = editInventory(new JinyongDocument(original), { "inventory.174.quantity": 30_000 });
  expect(result.output).toEqual(expected);
  expect(result.edits).toHaveLength(1);
  expect(new DataView(original.buffer).getInt16(38, true)).toBe(100);
});

it("adds missing silver and items, removes entries and keeps the bag compact", () => {
  const initial = new JinyongDocument(jinyongFixture());
  const removed = editInventory(initial, { "inventory.174.quantity": 0 });
  expect(new JinyongDocument(removed.output).inventory().every((entry) => entry.id === -1)).toBe(
    true,
  );
  const added = editInventory(new JinyongDocument(removed.output), {
    "inventory.1.quantity": 3,
    "inventory.199.quantity": 20,
    "inventory.174.quantity": 2000,
  });
  const result = editInventory(new JinyongDocument(added.output), { "inventory.199.quantity": 0 });
  expect(new JinyongDocument(result.output).inventory().slice(0, 3)).toEqual([
    { id: 1, amount: 3 },
    { id: 174, amount: 2000 },
    { id: -1, amount: 0 },
  ]);
  expect(result.output.slice(0, 36)).toEqual(initial.copy().slice(0, 36));
  expect(result.output.slice(836)).toEqual(initial.copy().slice(836));
});

it("does not change a full bag, empty slots or unusual untouched amounts on a no-op", () => {
  const bytes = jinyongFixture();
  const data = new DataView(bytes.buffer);
  for (let id = 0; id < 200; id++) {
    data.setInt16(36 + id * 4, id, true);
    data.setInt16(38 + id * 4, 32_000, true);
  }
  const full = new JinyongDocument(bytes);
  expect(editInventory(full, {}).output).toEqual(bytes);
  const changed = editInventory(full, { "inventory.199.quantity": 1 });
  expect(inventoryField(new JinyongDocument(changed.output), 198).value).toBe(32_000);
  expect(inventoryField(new JinyongDocument(changed.output), 199).value).toBe(1);
  const original = new JinyongDocument(jinyongFixture());
  expect(
    editInventory(original, { "inventory.1.quantity": 0, "inventory.174.quantity": 100 }).edits,
  ).toEqual([]);
});

it("rejects invalid item identities and quantities atomically", () => {
  const document = new JinyongDocument(jinyongFixture());
  for (const key of [
    "inventory.200.quantity",
    "inventory.-1.quantity",
    "inventory.01.quantity",
    "inventory.1.id",
    "money",
    "__proto__",
  ]) {
    expect(() => editInventory(document, { "inventory.174.quantity": 2000, [key]: 1 })).toThrow();
    expect(document.copy()).toEqual(jinyongFixture());
  }
  for (const value of [-1, 30_001, 0.5, Number.NaN, Infinity])
    expect(() => editInventory(document, { "inventory.1.quantity": value })).toThrow();
});
