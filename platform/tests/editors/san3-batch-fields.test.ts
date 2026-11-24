import { afterEach, describe, expect, it, vi } from "vitest";
import { expandSan3Batch } from "../../src/editors/san3/batch.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import * as operationFields from "../../src/editors/san3/operation-fields.ts";
import { editSan3Campaign } from "../../src/editors/san3/operations.ts";
import { san3GovernanceFixture } from "./san3-governance-fixture.ts";

afterEach(() => vi.restoreAllMocks());

describe("SAN3 requested batch field construction", () => {
  it("skips destination simulations for scalar, book and personal treasure copies", () => {
    const bytes = san3GovernanceFixture();
    const document = new San3Document(bytes);
    const spy = vi.spyOn(operationFields, "san3OperationFields");
    for (const [key, value, copied] of [
      ["officer.1.loyalty", 91, "officer.2.loyalty"],
      ["book.1.copies", 7, "book.2.copies"],
      ["personalTreasure.1.4", 1, "personalTreasure.2.4"],
    ] as const) {
      const draft = { [key]: value };
      const expanded = expandSan3Batch(document, draft, "officer", 1, [2]);
      expect(expanded).toEqual({ ...draft, [copied]: value });
    }
    const unrelated = expandSan3Batch(
      document,
      { "officer.1.loyalty": 91, "move.3.city": 2 },
      "officer",
      1,
      [2],
    );
    expect(unrelated).toEqual({
      "officer.1.loyalty": 91,
      "officer.2.loyalty": 91,
      "move.3.city": 2,
    });
    expect(new San3Document(editSan3Campaign(document, unrelated).bytes).officer(3).city).toBe(2);
    expect(spy).not.toHaveBeenCalled();
    expect(document.copy()).toEqual(bytes);
  });

  it("still validates and expands explicitly requested relocation destinations", () => {
    const document = new San3Document(san3GovernanceFixture());
    const spy = vi.spyOn(operationFields, "san3OperationFields");
    const expanded = expandSan3Batch(document, { "move.1.city": 1 }, "officer", 1, [2]);
    expect(expanded).toEqual({ "move.1.city": 1, "move.2.city": 1 });
    expect(spy.mock.calls.map(([, , index]) => index)).toEqual([1, 2]);
    const result = new San3Document(editSan3Campaign(document, expanded).bytes);
    for (const index of [1, 2]) expect(result.officer(index).city).toBe(1);
  });

  it("retains final atomic validation when a copied scalar is invalid for its target", () => {
    const bytes = san3GovernanceFixture();
    const document = new San3Document(bytes);
    const spy = vi.spyOn(operationFields, "san3OperationFields");
    expect(() =>
      expandSan3Batch(document, { "officer.1.loyalty": 91 }, "officer", 1, [2, 11]),
    ).toThrow();
    expect(spy).not.toHaveBeenCalled();
    expect(document.copy()).toEqual(bytes);
  });
});
