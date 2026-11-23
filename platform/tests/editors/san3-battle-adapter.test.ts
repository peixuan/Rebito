import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3BattleDocument } from "../../src/editors/san3/battle.ts";
import { san3BattleAdapter } from "../../src/editors/san3/battle-adapter.ts";
import type { EditorDraft } from "../../src/editors/types.ts";
import { san3BattleFixture } from "./san3-battle-fixture.ts";

describe("SAN3 battle editor boundary", () => {
  it("defaults to the current unit and retains canonical edits while selecting another unit", () => {
    const bytes = san3BattleFixture();
    const initial = san3BattleAdapter.view(bytes, {});
    expect(initial.selected).toBe("0");
    expect(initial.modules).toEqual([{ id: "battle", label: { messageId: "san3.battle" } }]);
    expect(initial.actions).toEqual([]);
    expect(initial.records.map(({ label }) => label)).toEqual(["B", "C", "A"]);
    const draft = { record: "1", changes: { "battle.0.mobility": 90, "battle.1.mobility": 6 } };
    const view = san3BattleAdapter.view(bytes, draft);
    expect(view.selected).toBe("1");
    expect(view.changes).toEqual({ "battle.0.mobility": 90 });
    expect(previewedEditorChanges(view)).toEqual(view.changes);
    expect(san3Adapter.view(bytes, draft)).toEqual(view);
    expect(view.instructions).toEqual({ messageId: "san3.battleInstructions" });
    expect(view.preview).toMatchObject([{ key: "battle.0.mobility", before: 5, after: 90 }]);
    expect(view.fields[0]?.key).toBe("battle.1.mobility");
    expect(JSON.stringify(view)).not.toMatch(/"(?:offset|width)":/);
    const edited = san3BattleAdapter.apply(bytes, { record: "1", changes: view.changes });
    expect(san3Adapter.apply(bytes, { changes: view.changes })).toEqual(edited);
    expect(new San3BattleDocument(edited).officer(0).mobility).toBe(90);
    expect(() => san3BattleAdapter.apply(bytes, { changes: { "battle.0.mobility": 5 } })).toThrow(
      "editor.noChanges",
    );
  });

  it("rejects unsupported records, actions, text and strategic fields without partial writes", () => {
    const bytes = san3BattleFixture();
    const before = bytes.slice();
    const drafts: EditorDraft[] = [
      { slot: 1 },
      { module: "officers" },
      { record: "00" },
      { record: "3" },
      { record: "-1" },
      { record: "600" },
      { action: { id: "batch-copy", record: "0" } },
      { textChanges: { "custom.0.kanji": "A" } },
      { changes: { "battle.0.mobility": 90, "city.0.gold": 500 } },
    ];
    for (const draft of drafts) {
      expect(() => san3BattleAdapter.view(bytes, draft)).toThrow();
      expect(() => san3BattleAdapter.apply(bytes, draft)).toThrow();
      expect(bytes).toEqual(before);
    }
  });
});
