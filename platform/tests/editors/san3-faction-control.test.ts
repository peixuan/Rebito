import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import {
  editSan3FactionControl,
  san3FactionControlFields,
} from "../../src/editors/san3/faction-control.ts";
import { san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 faction control", () => {
  it("shows control in faction records and expands eligible batch changes", () => {
    const bytes = san3GovernanceFixture();
    const view = san3Adapter.view(bytes, {
      module: "factions",
      record: "0",
      changes: { "factionControl.0.human": 1 },
      action: { id: "copy-fields", record: "0", targets: ["1"] },
    });
    expect(view.batchKeys).toEqual(["factionControl.0.human"]);
    expect(view.records[0]?.cells.factionControl).toEqual({ messageId: "san3.factionControl1" });
    expect(view.columns.find(({ id }) => id === "factionControl")?.defaultVisible).toBe(true);
    expect(view.changes).toEqual({ "factionControl.0.human": 1, "factionControl.1.human": 1 });
    expect(san3Adapter.apply(bytes, { changes: view.changes }).slice(0x7dc0a, 0x7dc0c)).toEqual(
      Uint8Array.of(1, 1),
    );
    expect(() =>
      san3Adapter.apply(bytes, {
        module: "factions",
        record: "0",
        changes: { "factionControl.0.human": 1 },
        action: { id: "copy-fields", record: "0", targets: ["1", "20"] },
      }),
    ).toThrow();
    expect(bytes[0x7dc0a]).toBe(0);
  });

  it("changes either active faction without rewriting turn pointers, queues or diplomacy", () => {
    const bytes = Buffer.from(san3GovernanceFixture());
    bytes.writeUInt32BE(san3Layout.factions.offset, 0x7dc22);
    const original = Buffer.from(bytes);
    const document = new San3Document(bytes);
    const result = editSan3FactionControl(document, {
      "factionControl.0.human": 1,
      "factionControl.1.human": 1,
    });
    expect(result.writes).toEqual([
      { offset: 0x7dc0a, width: 1, before: 0, after: 1 },
      { offset: 0x7dc0b, width: 1, before: 0, after: 1 },
    ]);
    const restored = result.bytes.slice();
    restored[0x7dc0a] = restored[0x7dc0b] = 0;
    expect(restored).toEqual(new Uint8Array(original));
    expect(bytes).toEqual(original);
    expect(document.copy()).toEqual(new Uint8Array(original));
    expect(editSan3FactionControl(document, previewedEditorChanges(result)).bytes).toEqual(
      result.bytes,
    );
    const after = new San3Document(result.bytes);
    expect(san3FactionControlFields(after, 1)[0]).toMatchObject({ value: 1, readonly: false });
    expect(editSan3FactionControl(after, result.changes)).toMatchObject({
      changes: {},
      preview: [],
      writes: [],
    });
    expect(editSan3FactionControl(after, { "factionControl.0.human": 0 }).bytes[0x7dc0a]).toBe(0);
  });

  it("recognizes native nonzero player flags and rejects inactive factions or malformed drafts", () => {
    const bytes = san3GovernanceFixture();
    bytes[0x7dc0b] = 2;
    const document = new San3Document(bytes);
    expect(san3FactionControlFields(document, 1)[0]).toMatchObject({ value: 1, readonly: false });
    expect(editSan3FactionControl(document, { "factionControl.1.human": 1 }).writes).toEqual([]);
    expect(editSan3FactionControl(document, { "factionControl.1.human": 0 }).writes).toEqual([
      { offset: 0x7dc0b, width: 1, before: 2, after: 0 },
    ]);
    expect(san3FactionControlFields(document, 2)[0]?.readonly).toBe(true);
    for (const invalid of [
      { "factionControl.2.human": 1 },
      { "factionControl.21.human": 1 },
      { "factionControl.00.human": 1 },
      { "factionControl.0.human": 0.5 },
      { "factionControl.0.human": 2 },
      { "factionControl.0.human": -1 },
      { "factionControl.0.player": 1 },
    ])
      expect(() =>
        editSan3FactionControl(document, { "factionControl.0.human": 1, ...invalid }),
      ).toThrow();
    expect(document.copy()).toEqual(bytes);
  });
});
