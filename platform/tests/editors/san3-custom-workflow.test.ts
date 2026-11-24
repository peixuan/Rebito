import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { san3AppearanceFixture } from "./san3-appearance-fixture.ts";

function draft() {
  return {
    module: "custom",
    record: "10",
    textChanges: { "custom.10.kanji": "\u6f22", "custom.10.kana": "\u3042" },
    changes: {
      "custom.10.gender": 1,
      "custom.10.birthMonth": 2,
      "custom.10.birthDay": 29,
      "custom.10.age": 20,
      ...Object.fromEntries(
        ["land", "naval", "strength", "intelligence", "politics", "charisma"].map((id, n) => [
          `officer.542.${id}`,
          91 + n,
        ]),
      ),
      "presence.542.role": 4,
      "presence.542.city": 0,
    },
  };
}

describe("SAN3 custom definition and placement drafts", () => {
  it("fills, registers and recruits in one atomic draft with reversible canonical previews", () => {
    const bytes = san3AppearanceFixture();
    const offset = san3Layout.officers.offset + 542 * 30;
    bytes.fill(0, offset, offset + 30);
    bytes[offset + 12] = 255;
    const original = bytes.slice();
    const request = draft();
    const filled = san3Adapter.view(bytes, {
      ...request,
      changes: Object.fromEntries(
        Object.entries(request.changes).filter(([key]) => !key.startsWith("presence.")),
      ),
    });
    expect(filled.fields.find(({ columnId }) => columnId === "presenceRole")).toMatchObject({
      readonly: false,
    });
    const view = san3Adapter.view(bytes, request);
    expect(view.changes).toMatchObject(request.changes);
    expect(view.textChanges).toEqual(request.textChanges);
    const effects = Object.fromEntries(view.preview.map((row) => [row.key, row]));
    expect(effects["presenceEffect.542.portrait"]).toMatchObject({ after: 277 });
    expect(effects["officer.542.land"]).toMatchObject({ before: 0, after: 91 });
    expect(effects["custom.10.kanji"]).toMatchObject({ before: "", after: "\u6f22" });
    const canonical = { ...request, changes: previewedEditorChanges(view) };
    const result = san3Adapter.apply(bytes, canonical);
    expect(san3Adapter.apply(bytes, request)).toEqual(result);
    const document = new San3Document(result);
    expect(document.officer(542)).toMatchObject({ name: "\u6f22", role: 4, city: 0, faction: 0 });
    expect(inspectSan3Governance(document).cities[0]?.serving).toEqual([0, 1, 540, 2, 542]);
    expect(document.attributes(542)).toMatchObject({ land: 91, naval: 92, charisma: 96 });
    expect(bytes).toEqual(original);
    const switched = san3Adapter.view(bytes, { ...canonical, module: "officers", record: "542" });
    expect(switched.changes).toEqual(view.changes);
    expect(switched.textChanges).toEqual(view.textChanges);
    expect(switched.fields.find(({ columnId }) => columnId === "presenceRole")).toMatchObject({
      value: 4,
      readonly: false,
    });
  });

  it("rejects mixed unrelated operations and invalid definitions without modifying the input", () => {
    const bytes = san3AppearanceFixture();
    const original = bytes.slice();
    for (const extra of [
      { "city.0.gold": 10 },
      { "officer.541.loyalty": 10 },
      { "move.541.city": 0 },
      { "appearance.541.year": 191 },
      { "custom.10.birthDay": 30 },
      { "officer.542.land": 101 },
    ]) {
      const request = draft();
      expect(() =>
        san3Adapter.apply(bytes, { ...request, changes: { ...request.changes, ...extra } }),
      ).toThrow();
      expect(bytes).toEqual(original);
    }
  });

  it("retains an appearance-year intent across custom and officer views with a definition edit", () => {
    const bytes = san3AppearanceFixture();
    const request = {
      module: "custom",
      record: "9",
      changes: { "appearance.541.year": 191, "officer.541.intelligence": 93 },
    };
    const view = san3Adapter.view(bytes, request);
    expect(view.changes).toEqual(request.changes);
    expect(view.fields.find(({ columnId }) => columnId === "appearanceYear")?.value).toBe(191);
    const switched = san3Adapter.view(bytes, { ...request, module: "officers", record: "541" });
    expect(switched.changes).toEqual(view.changes);
    expect(switched.fields.find(({ columnId }) => columnId === "appearanceOffset")?.value).toBe(3);
    const result = new San3Document(san3Adapter.apply(bytes, request));
    expect(result.attributes(541).intelligence).toBe(93);
    expect(result.read(san3Layout.custom.offset + 9 * 28 + 2, 1)).toBe(3);
    expect(result.officer(541).role).toBe(255);
  });
});
