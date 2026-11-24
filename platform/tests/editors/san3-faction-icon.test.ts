import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { editSan3FactionIcon, san3FactionIconFields } from "../../src/editors/san3/faction-icon.ts";
import { san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 faction symbols", () => {
  it("allows duplicate or neutral symbols without changing faction identity or any other byte", () => {
    const bytes = Buffer.from(san3GovernanceFixture());
    bytes[0x7878c] = 17;
    bytes[0x7878d] = 19;
    const original = Buffer.from(bytes);
    const document = new San3Document(bytes);
    const result = editSan3FactionIcon(document, {
      "factionIcon.1.symbol": 24,
      "factionIcon.0.symbol": 24,
      "factionIcon.20.symbol": 23,
    });
    expect(result.writes).toEqual([
      { offset: 0x7878c, width: 1, before: 17, after: 24 },
      { offset: 0x7878d, width: 1, before: 19, after: 24 },
      { offset: 0x787a0, width: 1, before: 0, after: 23 },
    ]);
    const restored = result.bytes.slice();
    for (const write of result.writes) restored[write.offset] = write.before;
    expect(restored).toEqual(new Uint8Array(original));
    expect(bytes).toEqual(original);
    expect(document.copy()).toEqual(new Uint8Array(original));
    expect(editSan3FactionIcon(document, previewedEditorChanges(result)).bytes).toEqual(
      result.bytes,
    );
    const after = new San3Document(result.bytes);
    expect(editSan3FactionIcon(after, result.changes)).toMatchObject({
      changes: {},
      preview: [],
      writes: [],
    });
    expect(san3FactionIconFields(after, 20)[0]).toMatchObject({ value: 23, min: 0, max: 24 });
    expect(san3FactionIconFields(after, 0)[0]?.choices).toHaveLength(25);
  });

  it("rejects out-of-table image references and malformed drafts atomically", () => {
    const bytes = san3GovernanceFixture();
    const document = new San3Document(bytes);
    for (const invalid of [
      { "factionIcon.21.symbol": 1 },
      { "factionIcon.00.symbol": 1 },
      { "factionIcon.1.symbol": 25 },
      { "factionIcon.1.symbol": -1 },
      { "factionIcon.1.symbol": 1.5 },
      { "factionIcon.1.symbol": Number.NaN },
      { "factionIcon.1.symbol": Number.POSITIVE_INFINITY },
      { "factionIcon.1.icon": 1 },
    ])
      expect(() =>
        editSan3FactionIcon(document, { "factionIcon.0.symbol": 23, ...invalid }),
      ).toThrow();
    expect(document.copy()).toEqual(bytes);
  });
});
