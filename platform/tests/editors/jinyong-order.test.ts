import { expect, it } from "vitest";
import { JinyongDocument } from "../../src/editors/jinyong/document.ts";
import { editInventory } from "../../src/editors/jinyong/inventory.ts";
import { orderInventory } from "../../src/editors/jinyong/order.ts";
import { jinyongFixture } from "./jinyong-fixture.ts";

function fixture() {
  return new JinyongDocument(
    editInventory(new JinyongDocument(jinyongFixture()), {
      "inventory.2.quantity": 7,
      "inventory.199.quantity": 9,
    }).output,
  );
}
function ids(bytes: Uint8Array) {
  return new JinyongDocument(bytes)
    .inventory()
    .filter(({ id }) => id !== -1)
    .map(({ id }) => id);
}

it("moves actual bag entries without changing amounts or bytes outside the bag", () => {
  const original = fixture();
  for (const [action, record, expected] of [
    ["top", "199", [199, 174, 2]],
    ["up", "199", [174, 199, 2]],
    ["down", "174", [2, 174, 199]],
    ["bottom", "174", [2, 199, 174]],
  ] as const) {
    const result = orderInventory(original, original, {}, { id: action, record });
    expect(ids(result.output)).toEqual(expected);
    expect(result.output.slice(0, 36)).toEqual(original.copy().slice(0, 36));
    expect(result.output.slice(836)).toEqual(original.copy().slice(836));
    expect(
      new JinyongDocument(result.output)
        .inventory()
        .filter(({ id }) => id !== -1)
        .sort((a, b) => a.id - b.id),
    ).toEqual([
      { id: 2, amount: 7 },
      { id: 174, amount: 100 },
      { id: 199, amount: 9 },
    ]);
    const changes = Object.fromEntries(result.edits.map(({ key, after }) => [key, after]));
    expect(orderInventory(original, original, changes).output).toEqual(result.output);
  }
  expect(ids(orderInventory(original, original, { "inventory.199.position": 1 }).output)).toEqual([
    199, 174, 2,
  ]);
});

it("composes moves with quantity changes, removals and appended additions", () => {
  const original = fixture();
  const moved = orderInventory(original, original, {}, { id: "top", record: "199" });
  const order = Object.fromEntries(moved.edits.map(({ key, after }) => [key, after]));
  const quantities = {
    "inventory.2.quantity": 0,
    "inventory.199.quantity": 13,
    "inventory.1.quantity": 5,
  };
  const current = new JinyongDocument(editInventory(original, quantities).output);
  const result = orderInventory(original, current, { ...order, ...quantities });
  expect(new JinyongDocument(result.output).inventory().slice(0, 4)).toEqual([
    { id: 199, amount: 13 },
    { id: 174, amount: 100 },
    { id: 1, amount: 5 },
    { id: -1, amount: 0 },
  ]);
  const changes = {
    ...quantities,
    ...Object.fromEntries(result.edits.map(({ key, after }) => [key, after])),
  };
  expect(orderInventory(original, current, changes).output).toEqual(result.output);
  // Restoring a removed item appends it instead of discarding another item's place.
  changes["inventory.2.quantity"] = 7;
  const restored = new JinyongDocument(
    editInventory(original, { ...quantities, "inventory.2.quantity": 7 }).output,
  );
  expect(ids(orderInventory(original, restored, changes).output)).toEqual([199, 174, 1, 2]);
});

it("preserves gaps and unusual unused words on no-ops and cancels inverse moves", () => {
  const bytes = jinyongFixture();
  const data = new DataView(bytes.buffer);
  data.setInt16(42, 55, true);
  data.setInt16(48, 2, true);
  data.setInt16(50, 32000, true);
  const original = new JinyongDocument(bytes);
  for (const changes of [{}, { "inventory.174.position": 1 }])
    expect(orderInventory(original, original, changes).output).toEqual(bytes);
  const moved = orderInventory(original, original, {}, { id: "bottom", record: "174" });
  const changes = Object.fromEntries(moved.edits.map(({ key, after }) => [key, after]));
  const inverse = orderInventory(original, original, changes, { id: "top", record: "174" });
  expect(inverse.output).toEqual(bytes);
  expect(inverse.edits).toEqual([]);
});

it("rejects malformed permutations and commands without changing its input", () => {
  const original = fixture();
  for (const changes of [
    { "inventory.order.0": 2 }, // Duplicate item.
    { "inventory.order.200": -1 },
    { "inventory.order.01": 199 },
    { "inventory.order.0": 1 }, // Neither held nor added.
    { "inventory.order.0": -2 },
    { "inventory.order.0": 200 },
    { "inventory.order.0": 1.5 },
    { "inventory.174.position": 0 },
    { "inventory.174.position": 4 },
    { "inventory.174.position": NaN },
    { "inventory.1.position": 1 },
    { "inventory.174.position": 1, "inventory.2.position": 2 },
    { "inventory.174.slot": 1 },
  ] as Record<string, number>[])
    expect(() => orderInventory(original, original, changes)).toThrow();
  for (const action of [
    { id: "sort", record: "174" },
    { id: "up", record: "01" },
    { id: "up", record: "1" },
  ])
    expect(() => orderInventory(original, original, {}, action)).toThrow();
  expect(original.copy()).toEqual(fixture().copy());
});
