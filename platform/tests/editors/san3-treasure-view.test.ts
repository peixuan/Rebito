import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { san3BookFields, san3TreasureView } from "../../src/editors/san3/treasure-view.ts";
import { editSan3Treasures } from "../../src/editors/san3/treasures.ts";

function fixture() {
  const bytes = new Uint8Array(san3Layout.size);
  const data = new DataView(bytes.buffer);
  data.setUint32(0x78000, 0x4b4f4549);
  data.setUint32(0x78776, 0x4b4f4549);
  data.setUint16(0x78788, 200);
  for (let index = 0; index < 21; index++)
    data.setUint16(san3Layout.factions.offset + index * 50, index === 0 ? 0 : 0xffff);
  data.setUint32(san3Layout.factions.offset + 2, san3Layout.cities.offset);
  for (let index = 0; index < 46; index++) {
    const base = san3Layout.cities.offset + index * 52;
    for (const relative of [4, 6, 8, 10]) data.setUint16(base + relative, 0xffff);
    bytes[base + 20] = index === 0 ? 0 : 255;
  }
  data.setUint16(san3Layout.cities.offset + 4, 0);
  for (let index = 0; index < 600; index++) {
    const base = san3Layout.officers.offset + index * 30;
    data.setUint16(base, index === 0 ? 1 : 0xffff);
    bytes[base + 12] = index === 0 ? 0 : index === 1 ? 3 : 7;
  }
  for (let index = 1; index < 13; index++) data.setUint16(0x787aa + index * 2, 0xffff);
  data.setUint16(0x787ae, 601);
  return bytes;
}

describe("SAN3 treasure presentation", () => {
  it("previews and publishes canonical ownership intents through the memory adapter", () => {
    const bytes = fixture();
    const changes = { "treasure.1.owner": 1, "book.1.copies": 2, "city.0.gold": 123 };
    const view = san3Adapter.view(bytes, { module: "treasures", record: "1", changes });
    expect(view.records).toHaveLength(13);
    expect(view.fields[0]).toMatchObject({ key: "treasure.1.owner", value: 1 });
    expect(view.changes).toEqual(changes);
    expect(view.batchKeys).toBeUndefined();
    expect(view.preview).toHaveLength(3);
    const edited = san3Adapter.apply(bytes, { changes: view.changes });
    expect(san3TreasureView(new San3Document(edited), 1).fields[0]?.value).toBe(1);
    const officer = san3Adapter.view(edited, { module: "officers", record: "1" });
    expect(officer.fields.find(({ columnId }) => columnId === "bookCopies")).toMatchObject({
      value: 2,
    });
    expect(officer.batchKeys).toContain("book.1.copies");
    const noops = { "treasure.1.owner": 65535, "book.1.copies": 0 };
    expect(san3Adapter.view(bytes, { module: "treasures", changes: noops }).changes).toEqual({});
    expect(() => san3Adapter.apply(bytes, { changes: noops })).toThrow("editor.noChanges");
    for (const extra of [
      { "move.1.city": 1 },
      { "ruler.0.officer": 1 },
      { "lifecycle.1.turncoatMonths": 3 },
    ])
      expect(() => san3Adapter.apply(bytes, { changes: { ...changes, ...extra } })).toThrow();
    expect(() =>
      san3Adapter.view(bytes, {
        module: "treasures",
        action: { id: "copy-fields", record: "1", targets: ["2"] },
      }),
    ).toThrow();
  });

  it("offers all thirteen records, guarded recipients, removal and read-only event owners", () => {
    const bytes = fixture();
    bytes.set([0x54, 0x65, 0x73, 0x74], 0x45620 + 18 + 5);
    const document = new San3Document(bytes);
    const view = san3TreasureView(document, 1);
    expect(view.records).toHaveLength(13);
    expect(view.records[1]?.label).toBe("Test");
    expect(view.fields[0]?.choices?.map(({ value }) => value)).toEqual([65535, 0, 1]);
    expect(view.fields[0]?.readonly).toBe(false);
    expect(san3TreasureView(document, 2).fields[0]).toMatchObject({ value: 601, readonly: true });
    expect(san3TreasureView(document, 0).fields[0]).toMatchObject({
      value: 0,
      max: 65535,
      readonly: true,
    });
    bytes[san3Layout.officers.offset + 30 + 8] = 4;
    expect(
      san3TreasureView(new San3Document(bytes), 1).fields[0]?.choices?.map(({ value }) => value),
    ).toEqual([65535, 0]);
    const owned = editSan3Treasures(document, { "treasure.1.owner": 1 }).bytes;
    owned[san3Layout.officers.offset + 30 + 8] = 4;
    expect(san3TreasureView(new San3Document(owned), 1).fields[0]).toMatchObject({
      value: 1,
      readonly: true,
    });
  });

  it("shows independent personal limits and leaves ordinary inspection usable on invalid inventory", () => {
    const bytes = editSan3Treasures(new San3Document(fixture()), { "book.1.copies": 5 }).bytes;
    const document = new San3Document(bytes);
    expect(san3BookFields(document, 0)[0]).toMatchObject({ value: 0, max: 7 });
    expect(san3BookFields(document, 1)[0]).toMatchObject({ value: 5, max: 7 });
    expect(san3BookFields(document, 2)[0]).toMatchObject({ value: 0, max: 7 });
    new DataView(bytes.buffer).setUint16(0x787ac, 602);
    const malformed = new San3Document(bytes);
    expect(san3BookFields(malformed, 0)).toEqual([]);
    expect(() => san3TreasureView(malformed, 0)).toThrow();
    for (const index of [-1, 13, 0.5, Number.NaN])
      expect(() => san3TreasureView(document, index)).toThrow();
    expect(() => san3BookFields(document, 600)).toThrow();
  });
});
