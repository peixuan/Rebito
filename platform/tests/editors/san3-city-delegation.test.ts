import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import {
  editSan3Delegation,
  san3DelegationFields,
} from "../../src/editors/san3/city-delegation.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

describe("SAN3 city delegation", () => {
  it("preserves other flags and all unrelated bytes across independent cities", () => {
    const original = Buffer.from(san3GovernanceFixture());
    const document = new San3Document(original);
    const changes = { "delegation.1.mode": 3, "delegation.2.mode": 0 };
    const result = editSan3Delegation(document, changes);
    expect(result.changes).toEqual(changes);
    expect(result.preview.map(({ key }) => key)).toEqual(Object.keys(changes));
    const canonical = previewedEditorChanges(result);
    expect(canonical).toEqual(changes);
    expect(editSan3Delegation(document, canonical).bytes).toEqual(result.bytes);
    expect(result.writes).toEqual([
      { offset: city(1) + 23, width: 1, before: 0xa5, after: 0xa7 },
      { offset: city(2) + 23, width: 1, before: 0xa5, after: 0xa4 },
    ]);
    const restored = result.bytes.slice();
    for (const { offset, before } of result.writes) restored[offset] = before;
    expect(restored).toEqual(new Uint8Array(original));
    expect(original).toEqual(Buffer.from(san3GovernanceFixture()));
    expect(document.copy()).toEqual(new Uint8Array(original));
    expect(
      editSan3Delegation(document, Object.fromEntries(Object.entries(changes).reverse())).bytes,
    ).toEqual(result.bytes);
  });

  it("allows all factions but requires qualified governors for direct administration", () => {
    const document = new San3Document(san3GovernanceFixture());
    expect(san3DelegationFields(document, 1)[0]?.choices?.map(({ value }) => value)).toEqual([
      1, 2, 3,
    ]);
    expect(() => editSan3Delegation(document, { "delegation.1.mode": 0 })).toThrow();
    expect(editSan3Delegation(document, { "delegation.3.mode": 3 }).changes).toEqual({
      "delegation.3.mode": 3,
    });
    expect(editSan3Delegation(document, { "delegation.2.mode": 0 }).writes).toHaveLength(1);
    const changed = editSan3Delegation(document, { "delegation.2.mode": 2 });
    const repeated = editSan3Delegation(new San3Document(changed.bytes), changed.changes);
    expect(repeated).toMatchObject({ changes: {}, preview: [], writes: [] });
    expect(repeated.bytes).toEqual(changed.bytes);
    expect(repeated.bytes).not.toBe(changed.bytes);
  });

  it("keeps blocked modes readable and rejects malformed, neutral and executing cities", () => {
    for (const mutate of [
      (data: DataView) => data.setUint32(0x7dc2a, city(2)),
      (data: DataView) => data.setUint8(city(2) + 22, 1),
      (data: DataView) => data.setUint8(city(2) + 22, 64),
      (data: DataView) => data.setUint8(officer(8) + 8, 16),
      (data: DataView) => data.setUint8(officer(8) + 8, 4),
      (data: DataView) => data.setUint16(officer(8), 8),
    ]) {
      const bytes = san3GovernanceFixture();
      mutate(new DataView(bytes.buffer));
      const document = new San3Document(bytes);
      expect(san3DelegationFields(document, 2)[0]).toMatchObject({ value: 1, readonly: true });
      expect(() => editSan3Delegation(document, { "delegation.2.mode": 0 })).toThrow();
      expect(document.copy()).toEqual(bytes);
    }
    const document = new San3Document(san3GovernanceFixture());
    expect(san3DelegationFields(document, 4)[0]?.readonly).toBe(true);
    expect(() => editSan3Delegation(document, { "delegation.4.mode": 0 })).toThrow();
  });

  it("validates complete mixed requests without changing the original", () => {
    const document = new San3Document(san3GovernanceFixture());
    for (const invalid of [
      { "delegation.2.mode": 4 },
      { "delegation.2.mode": -1 },
      { "delegation.2.mode": 1.5 },
      { "delegation.02.mode": 2 },
      { "delegation.46.mode": 2 },
      { "delegation.2.flags": 255 },
      { "city.2.delegation": 2 },
    ])
      expect(() => editSan3Delegation(document, { "delegation.1.mode": 3, ...invalid })).toThrow();
    expect(document.copy()).toEqual(san3GovernanceFixture());
  });
});
