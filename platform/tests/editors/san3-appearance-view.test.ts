import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import {
  editSan3Appearance,
  san3AppearanceFields,
} from "../../src/editors/san3/appearance-view.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { san3AppearanceFixture } from "./san3-appearance-fixture.ts";

describe("SAN3 automatic appearance controls", () => {
  it("keeps the earliest future year selectable and preserves a canonical draft", () => {
    const original = san3AppearanceFixture();
    const document = new San3Document(Buffer.from(original));
    const fields = san3AppearanceFields(document, 540);
    expect(fields[0]).toMatchObject({ value: 0, min: 0, max: 442 });
    expect(fields[0]?.choices?.slice(0, 3)).toEqual([
      { value: 0, label: { messageId: "san3.appearanceNotScheduled" } },
      { value: 190, label: "190" },
      { value: 191, label: "191" },
    ]);
    expect(fields[0]?.choices).toHaveLength(254);
    expect(fields[1]).toMatchObject({ value: 2, readonly: true });
    const draft = { "appearance.540.year": 190 };
    const first = editSan3Appearance(document, draft);
    expect(previewedEditorChanges(first)).toEqual(draft);
    expect(editSan3Appearance(document, previewedEditorChanges(first))).toEqual(first);
    expect(san3AppearanceFields(document, 540, draft).map((field) => field.value)).toEqual([
      190, 2,
    ]);
    expect(new San3Document(first.bytes).officer(540)).toMatchObject({
      role: 255,
      city: 255,
      faction: 255,
      soldiers: 0,
    });
    const effects = Object.fromEntries(first.preview.map((row) => [row.key, row]));
    expect(Object.keys(effects)).toEqual([
      "appearance.540.year",
      "appearanceEffect.540.role",
      "appearanceEffect.540.roster",
      "appearanceEffect.540.soldiers",
      "appearanceEffect.540.loyalty",
      "appearanceEffect.540.training",
      "appearanceEffect.540.morale",
      "appearanceEffect.540.faction",
      "appearanceEffect.540.advisor",
    ]);
    expect(effects["appearanceEffect.540.soldiers"]).toMatchObject({ before: 3000, after: 0 });
    expect(effects["appearanceEffect.540.advisor"]).toMatchObject({
      after: { messageId: "san3.none" },
    });
    const cancelled = editSan3Appearance(document, { "appearance.540.year": 0 });
    expect(cancelled).toEqual({ bytes: original, changes: {}, preview: [] });
    first.bytes.fill(0);
    cancelled.bytes.fill(0);
    expect(document.copy()).toEqual(original);
  });

  it("reschedules pending records without inventing a bare cancellation operation", () => {
    const bytes = san3AppearanceFixture();
    const document = new San3Document(bytes);
    const fields = san3AppearanceFields(document, 541);
    expect(fields[0]?.value).toBe(190);
    expect(fields[0]?.choices).toHaveLength(253);
    expect(fields[0]?.choices?.some((choice) => choice.value === 0)).toBe(false);
    expect(editSan3Appearance(document, { "appearance.541.year": 190 }).changes).toEqual({});
    const result = editSan3Appearance(document, { "appearance.541.year": 192 });
    expect(result.preview.map((row) => [row.key, row.before, row.after])).toEqual([
      ["appearance.541.year", 190, 192],
      ["appearanceEffect.541.offset", 2, 4],
    ]);
    expect(() => editSan3Appearance(document, { "appearance.541.year": 0 })).toThrow();
    bytes[san3Layout.custom.offset + 9 * 28 + 2] = 1;
    const missed = new San3Document(bytes);
    expect(san3AppearanceFields(missed, 541)[0]?.choices?.[0]).toEqual({
      value: 189,
      label: "189",
    });
    expect(editSan3Appearance(missed, { "appearance.541.year": 189 }).bytes).toEqual(bytes);
  });

  it("validates the entire batch while keeping unavailable rows and derived effects unwritable", () => {
    const bytes = san3AppearanceFixture();
    const document = new San3Document(bytes);
    for (const draft of [
      { "appearance.540.year": 191, "appearance.541.year": 189 },
      { "appearance.540.year": 191, "appearance.542.year": 192 },
      { "appearance.540.year": 191, "appearanceEffect.540.offset": 3 },
      { "appearance.0540.year": 191 },
      { "appearance.540.role": 255 },
      { "appearance.540.year": Number.NaN },
    ]) {
      expect(() => editSan3Appearance(document, draft)).toThrow();
      expect(document.copy()).toEqual(bytes);
    }
    for (const index of [0, 532, 539, 542, 600])
      expect(san3AppearanceFields(document, index)).toEqual([]);
    bytes[0x7dc28] = 1;
    expect(san3AppearanceFields(new San3Document(bytes), 540)).toEqual([]);
    const forward = { "appearance.540.year": 191, "appearance.541.year": 192 };
    const reverse = { "appearance.541.year": 192, "appearance.540.year": 191 };
    expect(editSan3Appearance(document, forward)).toEqual(editSan3Appearance(document, reverse));
  });
});
