import { describe, expect, it } from "vitest";
import {
  inspectSan3CustomAppearance,
  scheduleSan3CustomAppearance,
} from "../../src/editors/san3/custom-appearance.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { san3TreasureLayout } from "../../src/editors/san3/treasures.ts";
import { san3AppearanceFixture as fixture } from "./san3-appearance-fixture.ts";
import { governanceCity as city, governanceOfficer as officer } from "./san3-governance-fixture.ts";

const custom = (slot: number) => san3Layout.custom.offset + slot * 28;

describe("SAN3 native custom appearance scheduling", () => {
  it("retains the zero link of native pending records without accepting it for withdrawn rows", () => {
    const bytes = fixture();
    new DataView(bytes.buffer).setUint16(officer(541), 0);
    const document = new San3Document(bytes);
    const result = scheduleSan3CustomAppearance(document, 541, 191);
    expect(result.writes).toEqual([{ offset: custom(9) + 2, width: 1, before: 2, after: 3 }]);
    expect(new San3Document(result.bytes).read(officer(541), 2)).toBe(0);
    expect(scheduleSan3CustomAppearance(document, 541, 190).writes).toEqual([]);
    bytes[officer(541) + 12] = 7;
    expect(() => scheduleSan3CustomAppearance(new San3Document(bytes), 541, 191)).toThrow();
  });

  it("detaches a registered advisor, retires its army and writes an absolute future year", () => {
    const original = fixture();
    const document = new San3Document(Buffer.from(original));
    const result = scheduleSan3CustomAppearance(document, 540, 191);
    const changed = new San3Document(result.bytes);
    expect(inspectSan3Governance(changed).cities[0]).toMatchObject({
      serving: [0, 1, 2],
      advisor: 65535,
    });
    expect(inspectSan3Governance(changed).membership.has(540)).toBe(false);
    expect(changed.officer(540)).toMatchObject({
      role: 255,
      city: 255,
      faction: 255,
      soldiers: 0,
      training: 0,
      morale: 0,
    });
    expect(changed.read(officer(540), 2)).toBe(65535);
    expect(inspectSan3CustomAppearance(changed, 540)).toMatchObject({
      slot: 8,
      currentYear: 189,
      baseYear: 188,
      minYear: 190,
      maxYear: 442,
      offset: 3,
      pending: true,
      scheduledYear: 191,
    });
    expect(result.change).toEqual({
      index: 540,
      year: 191,
      previousYear: null,
      previousRole: 1,
      previousCity: 0,
      previousFaction: 0,
      soldiersRemoved: 3000,
      advisorRemoved: true,
    });
    const restored = result.bytes.slice();
    const restore = new DataView(restored.buffer);
    for (const { offset, width, before } of result.writes) {
      if (width === 1) restore.setUint8(offset, before);
      else if (width === 2) restore.setUint16(offset, before);
      else restore.setUint32(offset, before);
    }
    expect(restored).toEqual(original);
    expect(result.bytes[officer(540) + 8]).toBe(0x80);
    expect(result.bytes[officer(540) + 9]).toBe(0x80);
    expect(result.bytes[officer(540) + 10]).toBe(0x70);
    expect(result.bytes[officer(540) + 11]).toBe(0xe0);
    result.bytes.fill(0);
    original.fill(0);
    expect(document.copy()).toEqual(fixture());
  });

  it("reschedules pending or safely withdrawn definitions and preserves semantic no-ops", () => {
    const original = fixture();
    const document = new San3Document(original);
    const unchanged = scheduleSan3CustomAppearance(document, 541, 190);
    expect(unchanged.writes).toEqual([]);
    expect(unchanged.bytes).toEqual(original);
    unchanged.bytes.fill(0);
    expect(document.copy()).toEqual(original);
    const later = scheduleSan3CustomAppearance(document, 541, 442);
    expect(later.writes).toEqual([{ offset: custom(9) + 2, width: 1, before: 2, after: 254 }]);
    expect(later.change.previousYear).toBe(190);
    original[officer(541) + 12] = 7;
    original[custom(9) + 2] = 255;
    const withdrawn = scheduleSan3CustomAppearance(new San3Document(original), 541, 190);
    expect(withdrawn.change.previousYear).toBeNull();
    expect(withdrawn.writes.map(({ offset }) => offset)).toEqual([
      custom(9) + 2,
      officer(541) + 12,
    ]);
  });

  it("requires the native option, valid scenario years and an unbroken ordinary registration prefix", () => {
    const original = fixture();
    for (const [offset, width, value] of [
      [0x7dc28, 1, 1],
      [0x7dc2e, 1, 0],
      [0x7dc2e, 1, 8],
      [0x478ca, 2, 0],
      [0x478ca, 2, 189],
      [0x478ca, 2, 190],
      [0x78788, 2, 442],
      [custom(8), 2, 65535],
      [custom(9), 2, 65535],
      [custom(8) + 3, 1, 2],
      [custom(9) + 4, 1, 0],
      [custom(9) + 12, 1, 0],
    ] as const) {
      const bytes = original.slice();
      const data = new DataView(bytes.buffer);
      if (width === 1) data.setUint8(offset, value);
      else data.setUint16(offset, value);
      const document = new San3Document(bytes);
      expect(() => scheduleSan3CustomAppearance(document, 541, 190)).toThrow();
      expect(document.copy()).toEqual(bytes);
    }
    const document = new San3Document(original);
    for (const index of [-1, 0, 531, 532, 539, 600, 540.5, Number.NaN])
      expect(() => scheduleSan3CustomAppearance(document, index, 190)).toThrow();
    for (const year of [0, 188, 189, 443, 190.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => scheduleSan3CustomAppearance(document, 541, year)).toThrow();
  });

  it("rejects leaders, active transitions, equipment, belongings and malformed unlisted records", () => {
    const original = fixture();
    for (const [relative, value] of [
      [8, 16],
      [8, 4],
      [9, 64],
      [9, 8],
      [11, 8],
      [10, 1],
      [26, 7],
      [27, 1],
    ] as const) {
      const bytes = original.slice();
      bytes[officer(540) + relative] = value;
      expect(() => scheduleSan3CustomAppearance(new San3Document(bytes), 540, 190)).toThrow();
    }
    for (const [relative, width, value] of [
      [0, 2, 1],
      [12, 1, 3],
      [12, 1, 6],
      [16, 1, 0],
      [17, 1, 0],
      [2, 2, 1],
      [21, 1, 1],
      [22, 1, 1],
    ] as const) {
      const bytes = original.slice();
      const data = new DataView(bytes.buffer);
      if (width === 1) data.setUint8(officer(541) + relative, value);
      else data.setUint16(officer(541) + relative, value);
      expect(() => scheduleSan3CustomAppearance(new San3Document(bytes), 541, 190)).toThrow();
    }
    for (const kind of ["treasure", "books", "governor", "currentRuler"] as const) {
      const bytes = original.slice();
      const data = new DataView(bytes.buffer);
      if (kind === "treasure") {
        data.setUint16(san3TreasureLayout.owners + 2, 540);
        data.setUint16(officer(540) + 4, 2);
      } else if (kind === "books") {
        data.setUint16(san3TreasureLayout.owners, 1);
        data.setUint16(officer(540) + 4, 0x2001);
      } else if (kind === "currentRuler") data.setUint16(0x7dc26, 540);
      else {
        data.setUint16(city(0) + 4, 540);
        data.setUint16(officer(540), 0);
        data.setUint16(officer(1), 2);
      }
      expect(() => scheduleSan3CustomAppearance(new San3Document(bytes), 540, 190)).toThrow();
    }
    expect(original).toEqual(fixture());
  });
});
