import { describe, expect, it } from "vitest";
import { San3Document } from "../../src/editors/san3/document.ts";
import {
  editSan3Shipbuilding,
  san3ShipbuildingFields,
} from "../../src/editors/san3/shipbuilding.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

function fixture() {
  const bytes = san3GovernanceFixture();
  bytes[city(1) + 21] = 128;
  bytes[city(1) + 23] = 0xa4;
  bytes[city(1) + 42] = 2 | (5 << 3) | (1 << 6);
  bytes[city(1) + 43] = 99;
  bytes[0x7dc0a] = 1;
  return bytes;
}

describe("SAN3 independent shipbuilding countdowns", () => {
  it("decodes all three queues and exposes the safe stored ranges", () => {
    const document = new San3Document(fixture());
    expect(
      san3ShipbuildingFields(document, 1).map(({ key, value, min, max }) => ({
        key,
        value,
        min,
        max,
      })),
    ).toEqual([
      { key: "shipbuilding.1.heavy", value: 2, min: 0, max: 7 },
      { key: "shipbuilding.1.medium", value: 5, min: 0, max: 7 },
      { key: "shipbuilding.1.light", value: 1, min: 0, max: 3 },
    ]);
  });

  it("changes independent bit ranges in either order while preserving all other bytes", () => {
    const original = Buffer.from(fixture());
    const document = new San3Document(original);
    const changes = {
      "shipbuilding.1.heavy": 7,
      "shipbuilding.1.medium": 0,
      "shipbuilding.1.light": 3,
    };
    const result = editSan3Shipbuilding(document, changes);
    expect(result.bytes[city(1) + 42]).toBe(7 | (3 << 6));
    expect(result.changes).toEqual(changes);
    expect(result.writes).toEqual([{ offset: city(1) + 42, width: 1, before: 106, after: 199 }]);
    expect(result.preview.map(({ key }) => key)).toEqual(Object.keys(changes));
    expect(
      editSan3Shipbuilding(document, Object.fromEntries(Object.entries(changes).reverse())).bytes,
    ).toEqual(result.bytes);
    const restored = result.bytes.slice();
    restored[city(1) + 42] = original[city(1) + 42] as number;
    expect(restored).toEqual(new Uint8Array(original));
    expect(original).toEqual(Buffer.from(fixture()));
  });

  it("cancels without completing stock, refunds or officer changes and normalizes no-ops", () => {
    const document = new San3Document(fixture());
    const cancelled = editSan3Shipbuilding(document, { "shipbuilding.1.heavy": 0 });
    expect(cancelled.bytes[city(1) + 43]).toBe(99);
    expect(cancelled.writes.map(({ offset }) => offset)).toEqual([city(1) + 42]);
    const repeated = editSan3Shipbuilding(new San3Document(cancelled.bytes), cancelled.changes);
    expect(repeated).toMatchObject({ changes: {}, preview: [], writes: [] });
    expect(repeated.bytes).toEqual(cancelled.bytes);
    expect(repeated.bytes).not.toBe(cancelled.bytes);
  });

  it("hides unsupported ports and malformed contexts and rejects their writes", () => {
    for (const [offset, value] of [
      [city(1) + 21, 0],
      [city(1) + 23, 0xa5],
      [0x7dc0a, 0],
      [city(1) + 43, 101],
    ] as const) {
      const bytes = fixture();
      bytes[offset] = value;
      const document = new San3Document(bytes);
      expect(san3ShipbuildingFields(document, 1)).toEqual([]);
      expect(() => editSan3Shipbuilding(document, { "shipbuilding.1.heavy": 1 })).toThrow();
    }
    const bytes = fixture();
    new DataView(bytes.buffer).setUint16(officer(4), 4);
    const malformed = new San3Document(bytes);
    expect(san3ShipbuildingFields(malformed, 1)).toEqual([]);
    expect(() => editSan3Shipbuilding(malformed, { "shipbuilding.1.heavy": 1 })).toThrow();
  });

  it("rejects invalid and mixed batches atomically", () => {
    const original = fixture();
    const document = new San3Document(original);
    for (const invalid of [
      { "shipbuilding.1.heavy": 8 },
      { "shipbuilding.1.medium": -1 },
      { "shipbuilding.1.light": 4 },
      { "shipbuilding.1.light": 1.5 },
      { "shipbuilding.01.heavy": 1 },
      { "shipbuilding.46.heavy": 1 },
      { "shipbuilding.4.heavy": 1 },
      { "shipbuilding.1.raw": 255 },
      { "city.1.heavyWarship": 100 },
    ])
      expect(() =>
        editSan3Shipbuilding(document, { "shipbuilding.1.heavy": 1, ...invalid }),
      ).toThrow();
    expect(document.copy()).toEqual(original);
    expect(original).toEqual(fixture());
  });
});
