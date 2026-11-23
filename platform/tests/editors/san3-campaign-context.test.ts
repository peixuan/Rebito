import { describe, expect, it, vi } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { san3CampaignContext, san3ReadingField } from "../../src/editors/san3/campaign-context.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import * as lists from "../../src/editors/san3/relocation.ts";

const officer = (index: number) => san3Layout.officers.offset + index * 30;

/** One synthetic faction with serving, free and undiscovered officer lists. */
function fixture() {
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
  for (const [relative, value] of [
    [4, 0],
    [6, 3],
    [8, 4],
    [10, 1],
  ] as const)
    data.setUint16(san3Layout.cities.offset + relative, value);
  for (let index = 0; index < 600; index++) {
    const base = officer(index);
    data.setUint16(base, index < 2 ? index + 1 : 0xffff);
    data.setUint16(base + 2, index < 3 ? (index + 1) * 100 : 999);
    bytes[base + 12] = [0, 1, 2, 5, 6][index] ?? 7;
    bytes[base + 16] = index < 5 ? 0 : 255;
    bytes[base + 17] = index < 3 ? 0 : 255;
    bytes[base + 19] = index === 2 ? 0 : 255;
  }
  bytes.set(new TextEncoder().encode("Alpha"), san3Layout.historical.offset + 15);
  bytes.set(new TextEncoder().encode("Beta"), san3Layout.historical.offset + 30 + 15);
  bytes.set(new TextEncoder().encode("reading"), san3Layout.historical.offset + 22);
  bytes.set(new TextEncoder().encode("custom"), san3Layout.custom.offset + 20);
  return bytes;
}

describe("SAN3 campaign relationship context", () => {
  it("derives city counts from lists and names governor and advisor", () => {
    const context = san3CampaignContext(new San3Document(fixture()));
    const fields = context("cities", 0);
    expect(Object.fromEntries(fields.map(({ columnId, value }) => [columnId, value]))).toEqual({
      governor: 0,
      advisor: 1,
      servingCount: 3,
      freeCount: 1,
      hiddenCount: 1,
      soldiers: 600,
    });
    expect(fields[0]?.choices).toEqual([{ value: 0, label: "Alpha" }]);
    expect(fields[1]?.choices).toEqual([{ value: 1, label: "Beta" }]);
    expect(fields.every((field) => field.readonly && !("offset" in field))).toBe(true);
    expect(context("cities", 1).find(({ columnId }) => columnId === "governor")?.choices).toEqual([
      { value: 65535, label: { messageId: "san3.none" } },
    ]);
  });

  it("renders named roles, prior factions and historical or custom readings", () => {
    const document = new San3Document(fixture());
    const fields = san3CampaignContext(document)("officers", 2);
    expect(fields[0]?.choices?.[0]?.label).toEqual({ messageId: "san3.role2" });
    expect(fields[1]?.choices?.[0]?.label).toEqual({
      messageId: "san3.factionOf",
      parameters: { ruler: "Alpha" },
    });
    expect(san3ReadingField(document, 0)).toMatchObject({ value: "reading", readonly: true });
    expect(san3ReadingField(document, 532)).toMatchObject({ value: "custom", readonly: true });
  });

  it("constructs list context once per city view and keeps it out of editable drafts", () => {
    const inspect = vi.spyOn(lists, "inspectSan3Lists");
    try {
      const bytes = fixture();
      const view = san3Adapter.view(bytes, { module: "cities", record: "0" });
      expect(inspect).toHaveBeenCalledTimes(1);
      expect(view.records[0]?.cells).toMatchObject({
        governor: "Alpha",
        advisor: "Beta",
        soldiers: 600,
      });
      expect(view.batchKeys?.some((key) => key.startsWith("context."))).toBe(false);
      expect(() => san3Adapter.apply(bytes, { changes: { "context.servingCount": 8 } })).toThrow();
      expect(() => san3Adapter.apply(bytes, { textChanges: { "reading.0": "other" } })).toThrow();
      expect(
        san3Adapter.view(bytes, { module: "officers", record: "0" }).textFields,
      ).toContainEqual(
        expect.objectContaining({ key: "reading.0", value: "reading", readonly: true }),
      );
    } finally {
      inspect.mockRestore();
    }
  });

  it("omits derived city totals when a list is malformed while retaining scalar inspection", () => {
    const bytes = fixture();
    new DataView(bytes.buffer).setUint16(officer(2), 0);
    const document = new San3Document(bytes);
    const context = san3CampaignContext(document);
    expect(context("cities", 0)).toEqual([]);
    expect(context("officers", 2)).toHaveLength(2);
    const view = san3Adapter.view(bytes, { module: "cities", record: "0" });
    expect(view.fields.some(({ columnId }) => columnId === "population")).toBe(true);
    expect(view.fields.some(({ columnId }) => columnId === "servingCount")).toBe(false);
  });
});
