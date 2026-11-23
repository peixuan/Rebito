import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { editSan3, officerFields } from "../../src/editors/san3/fields.ts";

/** Synthetic strategic structure with one army and independent high-nibble state. */
function fixture(equipment: number) {
  const bytes = new Uint8Array(san3Layout.size);
  const data = new DataView(bytes.buffer);
  data.setUint32(0x78000, 0x4b4f4549);
  data.setUint32(0x78776, 0x4b4f4549);
  data.setUint16(0x78788, 200);
  for (let index = 0; index < 21; index++)
    data.setUint16(san3Layout.factions.offset + index * 50, 0xffff);
  data.setUint16(san3Layout.factions.offset, 0);
  data.setUint32(san3Layout.factions.offset + 2, san3Layout.cities.offset);
  for (let index = 0; index < 46; index++) {
    const city = san3Layout.cities.offset + index * 52;
    for (const relative of [4, 6, 8, 10]) data.setUint16(city + relative, 0xffff);
    bytes[city + 20] = index === 0 ? 0 : 255;
  }
  data.setUint16(san3Layout.officers.offset + 2, 2000);
  bytes[san3Layout.officers.offset + 10] = equipment | 0x70;
  bytes[san3Layout.officers.offset + 12] = 3;
  return new San3Document(bytes);
}

describe("SAN3 equipped army troop conservation", () => {
  it("rejects troop edits for every weapon or ship allocation", () => {
    for (let equipment = 1; equipment <= 15; equipment++) {
      const document = fixture(equipment);
      const original = document.copy();
      expect(
        officerFields(document, 0).find(({ columnId }) => columnId === "soldiers"),
      ).toMatchObject({
        readonly: true,
        help: { messageId: "san3.equippedTroopsHelp" },
      });
      for (const soldiers of [1000, 2001])
        expect(() => editSan3(document, { "officer.0.soldiers": soldiers })).toThrow();
      expect(document.copy()).toEqual(original);
    }
  });

  it("allows unequipped troop edits without treating lifespan as equipment", () => {
    const document = fixture(0);
    const result = editSan3(document, { "officer.0.soldiers": 2100 });
    expect(new San3Document(result.bytes).officer(0).soldiers).toBe(2100);
    expect(result.bytes[san3Layout.officers.offset + 10]).toBe(0x70);
  });

  it("explains the inventory constraint in the public editor view", () => {
    const view = san3Adapter.view(fixture(1).copy(), { module: "officers", record: "0" });
    expect(view.fields.find(({ columnId }) => columnId === "soldiers")).toMatchObject({
      readonly: true,
      help: { messageId: "san3.equippedTroopsHelp" },
    });
  });
});
