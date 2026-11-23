import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { san3Registration } from "../../src/editors/san3/registration.ts";

function fixture() {
  const bytes = new Uint8Array(san3Layout.size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0x78000, 0x4b4f4549);
  view.setUint32(0x78776, 0x4b4f4549);
  view.setUint16(0x78788, 200);
  for (let index = 0; index < 21; index++) view.setUint16(0x79148 + index * 50, 0xffff);
  view.setUint16(0x79148, 0);
  view.setUint32(0x7914a, 0x787c4);
  for (let index = 0; index < 46; index++) {
    const offset = 0x787c4 + index * 52;
    for (const relative of [4, 6, 8, 10]) view.setUint16(offset + relative, 0xffff);
    bytes[offset + 20] = index < 2 ? 0 : 0xff;
    view.setUint16(offset + 12, 700);
    view.setUint16(offset + 14, 1500);
    view.setUint32(offset + 16, 25_000);
  }
  for (let index = 0; index < 600; index++) bytes[0x79562 + index * 30 + 12] = 7;
  for (const index of [0, 1]) {
    const offset = 0x79562 + index * 30;
    bytes[offset + 12] = index === 0 ? 0 : 3;
    bytes[offset + 15] = 90;
    view.setUint16(offset + 2, 2000 + index * 1000);
    bytes.set([70, 60, 80, 90, 50, 40], 0x4021e + index * 30 + 5);
  }
  bytes.set(new TextEncoder().encode("Ruler"), 0x4021e + 15);
  bytes.set(new TextEncoder().encode("Town"), 0x44076 + 10);
  return bytes;
}

describe("SAN3 editor view", () => {
  it("edits unused custom defaults without registering an officer or changing its links", () => {
    const bytes = fixture();
    const data = new DataView(bytes.buffer);
    for (let index = 0; index < 68; index++) {
      const offset = san3Layout.custom.offset + index * san3Layout.custom.stride;
      data.setUint16(offset, 0xffff);
      bytes.set([50, 50, 50, 50, 50, 50, 1, 1, 20], offset + 4);
    }
    const view = san3Adapter.view(bytes, {
      module: "custom",
      record: "67",
      changes: {
        "custom.67.birthMonth": 2,
        "custom.67.birthDay": 29,
        "custom.67.age": 35,
        "officer.599.intelligence": 98,
      },
    });
    expect(view.records).toHaveLength(68);
    expect(view.fields.find(({ columnId }) => columnId === "birthDay")).toMatchObject({
      value: 29,
      max: 29,
    });
    expect(view.fields.find(({ columnId }) => columnId === "portrait")?.readonly).toBe(true);
    const result = san3Adapter.apply(bytes, { changes: view.changes });
    expect(result.subarray(san3Layout.officers.offset)).toEqual(
      bytes.subarray(san3Layout.officers.offset),
    );
    expect(new DataView(result.buffer).getUint16(san3Layout.custom.offset + 67 * 28)).toBe(0xffff);
    expect(new San3Document(result).attributes(599).intelligence).toBe(98);
  });

  it("binds to CD program RAM and keeps private layout details out of the UI", () => {
    expect(san3Registration).toMatchObject({
      system: "segacd",
      snapshot: { core: "picodrive", domain: "program" },
    });
    const view = san3Adapter.view(fixture(), {});
    expect(view.modules.map(({ id }) => id)).toEqual(["cities", "officers", "custom", "factions"]);
    expect(view).toMatchObject({ slot: 0, selected: "0", actions: [], changes: {}, preview: [] });
    expect(view.records[0]).toMatchObject({
      label: "Town",
      cells: { population: 70_000, gold: 1500, food: 25_000 },
    });
    expect(view.fields.find(({ columnId }) => columnId === "ruler")).toMatchObject({
      readonly: true,
      choices: [{ value: 0, label: "Ruler" }],
    });
    expect(JSON.stringify(view)).not.toMatch(/"(?:offset|width)":/);
  });

  it("filters active officers, labels missing names and locks inactive records", () => {
    const view = san3Adapter.view(fixture(), { module: "officers", record: "2" });
    expect(view.filter).toMatchObject({ tag: "active", defaultEnabled: true });
    expect(view.records.filter(({ tags }) => tags.includes("active"))).toHaveLength(2);
    expect(view.records[2]).toMatchObject({
      available: false,
      label: { messageId: "san3.officerRecord", parameters: { index: 3 } },
    });
    expect(view.fields.every(({ readonly }) => readonly)).toBe(true);
    expect(view.columns.filter(({ defaultVisible }) => defaultVisible).map(({ id }) => id)).toEqual(
      ["soldiers", "loyalty"],
    );
    expect(view.fields.find(({ columnId }) => columnId === "location")?.readonly).toBe(true);
  });

  it("aggregates only owned cities and active officers into read-only factions", () => {
    const view = san3Adapter.view(fixture(), { module: "factions" });
    expect(view.records[0]?.cells).toMatchObject({
      ruler: "Ruler",
      cityCount: 2,
      officerCount: 2,
      population: 140_000,
      gold: 3000,
      food: 50_000,
      soldiers: 5000,
    });
    expect(view.records[1]).toMatchObject({
      available: false,
      cells: { cityCount: 0, officerCount: 0 },
    });
    expect(view.fields.every(({ readonly }) => readonly)).toBe(true);
  });

  it("presents base abilities with checkpoint persistence guidance and canonical previews", () => {
    const bytes = fixture();
    const view = san3Adapter.view(bytes, {
      module: "officers",
      record: "1",
      changes: { "officer.1.strength": 99 },
    });
    expect(view.fields.find(({ columnId }) => columnId === "strength")).toMatchObject({
      value: 99,
      min: 1,
      max: 100,
      readonly: false,
    });
    expect(view.fields.find(({ columnId }) => columnId === "land")?.help).toEqual({
      messageId: "san3.historicalAttributesHelp",
    });
    expect(view.preview).toContainEqual(
      expect.objectContaining({
        key: "officer.1.strength",
        before: 80,
        after: 99,
      }),
    );
    expect(view.records[1]?.cells.strength).toBe(99);
    expect(JSON.stringify(view)).not.toMatch(/"(?:offset|width)":/);
    expect(
      new San3Document(san3Adapter.apply(bytes, { changes: view.changes })).attributes(1).strength,
    ).toBe(99);
  });

  it("canonicalizes accumulated drafts and previews population in people", () => {
    const bytes = fixture();
    const draft = {
      module: "factions",
      changes: { "city.0.gold": 1500, "city.1.population": 1234, "officer.1.morale": 78 },
    };
    const view = san3Adapter.view(bytes, draft);
    expect(view.changes).toEqual({ "city.1.population": 1234, "officer.1.morale": 78 });
    expect(view.preview).toContainEqual(
      expect.objectContaining({ key: "city.1.population", before: 70_000, after: 123_400 }),
    );
    expect(view.records[0]?.cells.population).toBe(193_400);
    const edited = new San3Document(san3Adapter.apply(bytes, draft));
    expect(edited.officer(1).morale).toBe(78);
    expect(edited.city(1).population).toBe(123_400);
    expect(() => san3Adapter.apply(bytes, { changes: { "city.0.gold": 1500 } })).toThrow(
      "editor.noChanges",
    );
  });

  it("rejects malformed selection, actions and read-only edits without mutating input", () => {
    const bytes = fixture();
    const original = bytes.slice();
    for (const draft of [
      { slot: 1 },
      { module: "invented" },
      { module: "cities", record: "46" },
      { module: "officers", record: "600" },
      { module: "factions", record: "21" },
      { record: "00" },
      { record: "-1" },
      { record: "1.0" },
      { action: { id: "anything", record: "0" } },
      { changes: { "context.ruler": 1 } },
      { changes: { "officer.0.loyalty": 99 } },
    ]) {
      expect(() => san3Adapter.view(bytes, draft)).toThrow();
      expect(() => san3Adapter.apply(bytes, draft)).toThrow();
    }
    expect(bytes).toEqual(original);
  });
});
