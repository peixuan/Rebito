import { describe, expect, it } from "vitest";
import { appointSan3Officer, san3AppointmentOptions } from "../../src/editors/san3/appointments.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";

const city = san3Layout.cities.offset;
const officer = (index: number) => san3Layout.officers.offset + index * 30;

/** One faction with a ruler, chief strategist, general and civil officer. */
function fixture() {
  const bytes = new Uint8Array(san3Layout.size);
  const data = new DataView(bytes.buffer);
  data.setUint32(0x78000, 0x4b4f4549);
  data.setUint32(0x78776, 0x4b4f4549);
  data.setUint16(0x78788, 200);
  for (let index = 0; index < 21; index++)
    data.setUint16(san3Layout.factions.offset + index * 50, 0xffff);
  data.setUint16(san3Layout.factions.offset, 0);
  data.setUint32(san3Layout.factions.offset + 2, city);
  for (let index = 0; index < 46; index++) {
    const base = city + index * 52;
    for (const relative of [4, 6, 8, 10]) data.setUint16(base + relative, 0xffff);
    bytes[base + 20] = index === 0 ? 0 : 0xff;
  }
  data.setUint16(city + 4, 0);
  data.setUint16(city + 10, 1);
  for (let index = 0; index < 600; index++) {
    const base = officer(index);
    data.setUint16(base, index < 3 ? index + 1 : 0xffff);
    bytes[base + 8] = 0x80;
    bytes[base + 10] = 0x70;
    bytes[base + 12] = [0, 1, 2, 4][index] ?? 7;
    bytes[base + 15] = 77;
    bytes[base + 16] = index < 4 ? 0 : 0xff;
    bytes[base + 17] = index < 4 ? 0 : 0xff;
  }
  const document = new San3Document(bytes);
  for (let index = 0; index < 4; index++)
    bytes.fill(85, document.attributeOffset(index), document.attributeOffset(index) + 6);
  bytes[123] = 219;
  return bytes;
}

describe("Japanese Mega-CD coherent officer appointments", () => {
  it("repairs the advisor seat and preserves armies, loyalty and every unrelated byte", () => {
    const original = fixture();
    const document = new San3Document(original);
    const assigned = appointSan3Officer(document, 2, 1, true);
    expect(assigned.change).toEqual({
      index: 2,
      city: 0,
      before: 2,
      after: 1,
      advisorBefore: 1,
      advisorAfter: 2,
    });
    expect(assigned.writes).toHaveLength(2);
    const restored = assigned.bytes.slice();
    const data = new DataView(restored.buffer);
    for (const { offset, width, before } of assigned.writes) {
      if (width === 1) data.setUint8(offset, before);
      else data.setUint16(offset, before);
    }
    expect(restored).toEqual(original);
    expect(document.copy()).toEqual(original);
    const demoted = appointSan3Officer(new San3Document(assigned.bytes), 2, 3);
    expect(demoted.change.advisorAfter).toBe(0xffff);
    const promoted = appointSan3Officer(new San3Document(demoted.bytes), 3, 1);
    expect(promoted.change.advisorAfter).toBe(3);
    expect(promoted.bytes[officer(3) + 15]).toBe(77);
  });

  it("keeps an existing advisor unless explicitly replaced, including an unchanged role", () => {
    const result = appointSan3Officer(new San3Document(fixture()), 2, 1);
    expect(result.change.advisorAfter).toBe(1);
    const document = new San3Document(result.bytes);
    expect(san3AppointmentOptions(document, 2).canAdvise).toBe(true);
    expect(appointSan3Officer(document, 2, 1, true).writes).toHaveLength(1);
    expect(() => appointSan3Officer(document, 2, 1)).toThrow();
    expect(san3AppointmentOptions(document, 1).canAdvise).toBe(false);
  });

  it("enforces native base-ability qualification boundaries without treasure bonuses", () => {
    const cases = [
      [1, [50, 50, 50, 79, 79, 50], false],
      [1, [50, 50, 50, 80, 79, 50], true],
      [1, [50, 50, 50, 79, 80, 50], true],
      [2, [0, 0, 85, 0, 0, 0], true],
      [2, [100, 100, 69, 0, 0, 100], false],
      [2, [70, 69, 70, 0, 0, 50], false],
      [2, [70, 70, 70, 0, 0, 50], true],
      [2, [0, 0, 101, 0, 0, 0], false],
    ] as const;
    for (const [role, attributes, allowed] of cases) {
      const bytes = fixture();
      bytes.set(attributes, new San3Document(bytes).attributeOffset(3));
      new DataView(bytes.buffer).setUint16(officer(3) + 4, 0x1ffe);
      const document = new San3Document(bytes);
      expect(san3AppointmentOptions(document, 3).roles.includes(role)).toBe(allowed);
      if (allowed) expect(appointSan3Officer(document, 3, role).change.after).toBe(role);
      else expect(() => appointSan3Officer(document, 3, role)).toThrow();
    }
  });

  it("rejects civil conversion requiring army redistribution or equipment refunds", () => {
    for (const [relative, value] of [
      [2, 10],
      [10, 1],
      [10, 4],
    ] as const) {
      const bytes = fixture();
      bytes[officer(2) + relative] = value;
      const document = new San3Document(bytes);
      expect(san3AppointmentOptions(document, 2).roles).not.toContain(4);
      expect(() => appointSan3Officer(document, 2, 4)).toThrow();
      const military = appointSan3Officer(document, 2, 3);
      expect(military.bytes[officer(2) + relative]).toBe(value);
    }
    expect(appointSan3Officer(new San3Document(fixture()), 2, 4).change.after).toBe(4);
  });

  it("rejects unsafe states, leaders, malformed graphs and invalid requests atomically", () => {
    for (const [relative, value] of [
      [8, 4],
      [8, 8],
      [8, 16],
      [9, 1],
      [9, 8],
      [9, 16],
      [9, 64],
      [11, 1],
      [11, 8],
      [11, 16],
      [26, 2],
      [27, 1],
    ] as const) {
      const bytes = fixture();
      bytes[officer(2) + relative] = value;
      const document = new San3Document(bytes);
      expect(san3AppointmentOptions(document, 2).roles).toEqual([]);
      expect(() => appointSan3Officer(document, 2, 3)).toThrow();
      expect(document.copy()).toEqual(bytes);
    }
    const document = new San3Document(fixture());
    for (const index of [0, 4, 599, 600, -1, 0.5])
      expect(() => appointSan3Officer(document, index, 3)).toThrow();
    for (const role of [-1, 0, 5, 0.5, Number.NaN])
      expect(() => appointSan3Officer(document, 2, role)).toThrow();
    expect(() => appointSan3Officer(document, 2, 3, true)).toThrow();
    const malformed = fixture();
    new DataView(malformed.buffer).setUint16(officer(2), 1);
    expect(() => appointSan3Officer(new San3Document(malformed), 2, 3)).toThrow();
    const governor = fixture();
    new DataView(governor.buffer).setUint16(city + 4, 2);
    new DataView(governor.buffer).setUint16(officer(2), 0);
    new DataView(governor.buffer).setUint16(officer(1), 3);
    expect(() => appointSan3Officer(new San3Document(governor), 2, 3)).toThrow();
  });
});
