import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { expandSan3Batch } from "../../src/editors/san3/batch.ts";
import { san3BatchDraft } from "../../src/editors/san3/batch-action.ts";
import { San3Document, san3Attributes, san3Layout } from "../../src/editors/san3/document.ts";
import { San3PresetDocument, san3PresetLayout } from "../../src/editors/san3/presets.ts";

/** Generated structures only; no original game tables or player data. */
function fixture() {
  const bytes = new Uint8Array(san3Layout.size);
  const data = new DataView(bytes.buffer);
  data.setUint32(0x78000, 0x4b4f4549);
  data.setUint32(0x78776, 0x4b4f4549);
  data.setUint16(0x78788, 200);
  for (let index = 1; index < san3Layout.factions.count; index++)
    data.setUint16(san3Layout.factions.offset + index * san3Layout.factions.stride, 0xffff);
  data.setUint32(san3Layout.factions.offset + 2, san3Layout.cities.offset);
  for (let index = 1; index < san3Layout.cities.count; index++)
    bytes[san3Layout.cities.offset + index * san3Layout.cities.stride + 0x14] = 0xff;
  for (let index = 0; index < 4; index++) {
    const offset = san3Layout.officers.offset + index * san3Layout.officers.stride;
    data.setUint16(offset + 2, 1000);
    bytes[offset + 0x0c] = index === 0 ? 0 : 3;
    bytes.fill(
      50,
      san3Layout.historical.offset + index * 30 + 5,
      san3Layout.historical.offset + index * 30 + 11,
    );
  }
  for (let index = 0; index < san3Layout.custom.count; index++) {
    const offset = san3Layout.custom.offset + index * san3Layout.custom.stride;
    data.setUint16(offset, 0xffff);
    bytes.set([0xc7, 1, 50, 50, 50, 50, 50, 50, 1, 31, 20], offset + 2);
  }
  for (const index of [532, 533]) {
    const offset = san3Layout.officers.offset + index * san3Layout.officers.stride;
    data.setUint16(offset + 2, 1000);
    bytes[offset + 12] = 3;
    data.setUint16(san3Layout.custom.offset + (index - 532) * 28, 231);
  }
  for (let index = 0; index < 311; index++) data.setUint16(0x478f0 + index * 2, 0x8000 + index);
  return bytes;
}

function presets() {
  const bytes = new Uint8Array(san3Layout.size);
  const data = new DataView(bytes.buffer);
  data.setUint16(0x4abc4, 4);
  for (const offset of [0x58a04, 0x58d6a]) {
    data.setUint16(offset, 0x207c);
    data.setUint32(offset + 2, san3PresetLayout.offset);
  }
  data.setUint16(0x58a5e, 0x745a);
  data.setUint16(0x58a62, 0x7446);
  data.setUint16(0x58d1a, 0x0c32);
  data.setUint16(0x58d1c, 100);
  bytes.fill(50, san3PresetLayout.offset, san3PresetLayout.offset + 24);
  return bytes;
}

describe("SAN3 numeric batch drafts", () => {
  it("expands preview actions into publishable intents and rejects ambiguous record IDs", () => {
    const bytes = fixture();
    const draft = {
      module: "cities",
      record: "0",
      changes: { "city.0.gold": 123 },
      action: { id: "copy-fields", record: "0", targets: ["1", "2"] },
    };
    const view = san3Adapter.view(bytes, draft);
    expect(view.changes).toEqual({ "city.0.gold": 123, "city.1.gold": 123, "city.2.gold": 123 });
    expect(view.batchKeys).toContain("city.0.gold");
    expect(new San3Document(san3Adapter.apply(bytes, { changes: view.changes })).city(2).gold).toBe(
      123,
    );
    for (const action of [
      { id: "wrong", record: "0", targets: ["1"] },
      { id: "copy-fields", record: "0" },
      { id: "copy-fields", record: "1", targets: ["2"] },
      { id: "copy-fields", record: "0", targets: ["01"] },
    ])
      expect(() => san3BatchDraft(new San3Document(bytes), { ...draft, action }, "city")).toThrow();
    expect(() =>
      san3Adapter.apply(bytes, {
        changes: Object.fromEntries([
          ["__proto__", 123],
          ["city.0.gold", 1],
        ]),
      }),
    ).toThrow();
  });

  it("copies only changed source columns and preserves unrelated drafts and memory", () => {
    const original = fixture();
    const document = new San3Document(original);
    const changes = {
      "city.0.gold": 100,
      "city.0.food": 0,
      "city.1.food": 200,
      "city.1.gold": 50,
      "officer.532.strength": 80,
    };
    const before = { ...changes };
    const expanded = expandSan3Batch(document, changes, "city", 0, [1, 45]);
    expect(expanded).toEqual({ ...changes, "city.1.gold": 100, "city.45.gold": 100 });
    expect(changes).toEqual(before);
    expect(document.copy()).toEqual(original);
    expect(expanded).not.toBe(changes);
    expect(() => expandSan3Batch(document, { "city.0.food": 0 }, "city", 0, [1])).toThrow();
  });

  it("validates copied soldiers against the complete target leadership draft", () => {
    const document = new San3Document(fixture());
    expect(
      expandSan3Batch(
        document,
        { "officer.532.soldiers": 19_000, "officer.532.land": 90 },
        "officer",
        532,
        [533],
      ),
    ).toMatchObject({ "officer.533.soldiers": 19_000, "officer.533.land": 90 });
    expect(() =>
      expandSan3Batch(document, { "officer.532.soldiers": 19_000 }, "officer", 532, [533]),
    ).toThrow();
    expect(() =>
      expandSan3Batch(document, { "officer.1.loyalty": 90 }, "officer", 1, [2, 0]),
    ).toThrow();
    expect(() =>
      expandSan3Batch(document, { "officer.0.loyalty": 90 }, "officer", 0, [1]),
    ).toThrow();
  });

  it("rejects historical ability sources and targets instead of partially expanding a batch", () => {
    const document = new San3Document(fixture());
    const before = document.copy();
    for (const id of san3Attributes) {
      const historical = { [`officer.1.${id}`]: 90, "city.0.gold": 123 };
      const custom = { [`officer.532.${id}`]: 90, "city.0.gold": 123 };
      expect(() => expandSan3Batch(document, historical, "officer", 1, [532])).toThrow();
      expect(() => expandSan3Batch(document, custom, "officer", 532, [533, 1])).toThrow();
      expect(custom).toEqual({ [`officer.532.${id}`]: 90, "city.0.gold": 123 });
    }
    expect(document.copy()).toEqual(before);
  });

  it("maps custom abilities and metadata without copying strategic fields or names", () => {
    const document = new San3Document(fixture());
    const changes = {
      "officer.532.strength": 99,
      "custom.0.birthMonth": 2,
      "custom.0.birthDay": 29,
    };
    expect(expandSan3Batch(document, changes, "custom", 0, [67])).toEqual({
      ...changes,
      "officer.599.strength": 99,
      "custom.67.birthMonth": 2,
      "custom.67.birthDay": 29,
    });
    expect(() =>
      expandSan3Batch(document, { "custom.0.birthMonth": 2 }, "custom", 0, [1]),
    ).toThrow();
    expect(() => expandSan3Batch(document, { "custom.0.kanji": 123 }, "custom", 0, [1])).toThrow();
    expect(() =>
      expandSan3Batch(document, { "officer.532.soldiers": 2000 }, "custom", 0, [1]),
    ).toThrow();
  });

  it("rejects malformed or repeated targets and unsupported source boundaries", () => {
    const document = new San3Document(fixture());
    for (const targets of [[], [0], [1, 1], [-1], [46], [0.5], [Number.NaN], Array(46).fill(1)])
      expect(() => expandSan3Batch(document, { "city.0.gold": 1 }, "city", 0, targets)).toThrow();
    for (const index of [-1, 46, 1.5])
      expect(() => expandSan3Batch(document, { "city.0.gold": 1 }, "city", index, [1])).toThrow();
    expect(() =>
      expandSan3Batch(document, { "city.0.gold": 1, "city.0.ruler": 2 }, "city", 0, [1]),
    ).toThrow();
    expect(() => expandSan3Batch(document, { "preset.0.land": 60 }, "preset", 0, [1])).toThrow();
  });

  it("validates every final creation budget without changing the source document", () => {
    const bytes = presets();
    bytes.set([50, 90, 90, 90, 90, 90], san3PresetLayout.offset + 6);
    const document = new San3PresetDocument(bytes);
    const changes = { "preset.0.land": 100, "preset.0.naval": 40, "preset.3.strength": 77 };
    expect(expandSan3Batch(document, changes, "preset", 0, [1, 2])).toEqual({
      ...changes,
      "preset.1.land": 100,
      "preset.1.naval": 40,
      "preset.2.land": 100,
      "preset.2.naval": 40,
    });
    expect(() =>
      expandSan3Batch(document, { "preset.0.land": 100 }, "preset", 0, [2, 1]),
    ).toThrow();
    expect(() => expandSan3Batch(document, { "city.0.gold": 1 }, "city", 0, [1])).toThrow();
    expect(document.copy()).toEqual(bytes);
  });
});
