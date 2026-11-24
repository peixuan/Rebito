import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { setSan3OfficerPresence } from "../../src/editors/san3/governance-membership.ts";
import { createSan3NameCodec, san3GlyphLayout } from "../../src/editors/san3/names.ts";
import { editSan3Presence, san3PresenceFields } from "../../src/editors/san3/presence-controls.ts";
import { san3AppearanceFixture } from "./san3-appearance-fixture.ts";
import { governanceOfficer as officer } from "./san3-governance-fixture.ts";
import { san3NameFixture } from "./san3-name-fixture.ts";

const definition = (slot: number) => san3Layout.custom.offset + slot * 28;

function fixture(slot = 10, gender = 1) {
  const bytes = san3AppearanceFixture();
  const font = san3NameFixture();
  bytes.set(
    font.subarray(san3GlyphLayout.offset, san3GlyphLayout.offset + san3GlyphLayout.count * 2),
    san3GlyphLayout.offset,
  );
  const base = definition(slot);
  new DataView(bytes.buffer).setUint16(base, 65535);
  bytes.set([255, gender, 60, 61, 62, 63, 64, 65, 1, 1, 20], base + 2);
  const codec = createSan3NameCodec(bytes);
  bytes.set(codec.encode("kanji", "\u6f22"), base + 13);
  bytes.set(codec.encode("kana", "\u3042"), base + 20);
  const dynamic = officer(532 + slot);
  bytes.fill(0, dynamic, dynamic + 30);
  bytes[dynamic + 12] = 255;
  return bytes;
}

describe("SAN3 custom officer registration and service", () => {
  it("retains existing personal belongings when registering and entering service", () => {
    const bytes = fixture();
    new DataView(bytes.buffer).setUint16(officer(542) + 4, 0x6007);
    const result = setSan3OfficerPresence(new San3Document(bytes), 542, 4, 1);
    expect(new San3Document(result.bytes).read(officer(542) + 4, 2)).toBe(0x6007);
    expect(result.writes.some(({ offset }) => offset === officer(542) + 4)).toBe(false);
  });

  it("registers a filled unused definition directly into a chosen city's service roster", () => {
    const bytes = fixture();
    new DataView(bytes.buffer).setUint16(officer(542) + 4, 1);
    bytes.set([0xa5, 0xc3], officer(542) + 6);
    bytes[officer(542) + 10] = 0x80;
    const document = new San3Document(Buffer.from(bytes));
    const result = setSan3OfficerPresence(document, 542, 4, 1);
    const changed = new San3Document(result.bytes);
    expect(result.change).toMatchObject({
      introduced: true,
      previousRole: 255,
      registeredPortrait: 277,
      city: 1,
      role: 4,
      faction: 0,
    });
    expect(inspectSan3Governance(changed).cities[1]?.serving).toEqual([3, 4, 5, 542]);
    expect(changed.officer(542)).toMatchObject({
      role: 4,
      city: 1,
      faction: 0,
      loyalty: 100,
      soldiers: 0,
      training: 0,
      morale: 0,
    });
    expect(changed.read(officer(542), 2)).toBe(65535);
    expect(changed.read(officer(542) + 4, 2)).toBe(0);
    expect(changed.read(officer(542) + 18, 1)).toBe(1);
    expect(changed.read(officer(542) + 19, 1)).toBe(255);
    expect(changed.read(officer(542) + 6, 2)).toBe(0xa5c3);
    expect(changed.read(officer(542) + 10, 1)).toBe(0x80);
    expect(changed.copy().slice(definition(10) + 2, definition(11))).toEqual(
      bytes.slice(definition(10) + 2, definition(11)),
    );
    const restored = result.bytes.slice();
    const restore = new DataView(restored.buffer);
    for (const write of result.writes) {
      if (write.width === 1) restore.setUint8(write.offset, write.before);
      else if (write.width === 2) restore.setUint16(write.offset, write.before);
      else restore.setUint32(write.offset, write.before);
    }
    expect(restored).toEqual(bytes);
    result.bytes.fill(0);
    expect(document.copy()).toEqual(bytes);
  });

  it("introduces an already registered pending officer without a year or appearance option", () => {
    const bytes = san3AppearanceFixture();
    new DataView(bytes.buffer).setUint16(officer(541), 0);
    bytes[0x7dc28] = 0;
    const document = new San3Document(bytes);
    const draft = { "presence.541.role": 4, "presence.541.city": 1 };
    const first = editSan3Presence(document, draft);
    expect(previewedEditorChanges(first)).toEqual(draft);
    expect(editSan3Presence(document, previewedEditorChanges(first))).toEqual(first);
    expect(new San3Document(first.bytes).officer(541)).toMatchObject({ role: 4, city: 1 });
    expect(first.bytes.slice(definition(9), definition(10))).toEqual(
      bytes.slice(definition(9), definition(10)),
    );
    expect(san3PresenceFields(document, 541, draft).map((field) => field.value)).toEqual([4, 1]);
    expect(san3PresenceFields(document, 541)[1]?.readonly).toBe(false);
  });

  it("previews the chosen default portrait and keeps dependent registration effects unwritable", () => {
    for (const [slot, gender, portrait] of [
      [0, 0, 231],
      [0, 1, 239],
      [10, 0, 247],
      [10, 1, 277],
    ] as const) {
      const document = new San3Document(fixture(slot, gender));
      const index = 532 + slot;
      const draft = { [`presence.${index}.role`]: 4, [`presence.${index}.city`]: 1 };
      const first = editSan3Presence(document, draft);
      const effect = first.preview.find((row) => row.key === `presenceEffect.${index}.portrait`);
      expect(effect).toMatchObject({ before: { messageId: "san3.unregistered" }, after: portrait });
      const faction = first.preview.find((row) => row.key === `presenceEffect.${index}.faction`);
      expect(faction).toMatchObject({
        before: { messageId: "san3.none" },
        after: { messageId: "san3.factionOf" },
      });
      expect(first.preview.some((row) => row.key === `presenceEffect.${index}.originFaction`)).toBe(
        false,
      );
      expect(previewedEditorChanges(first)).toEqual(draft);
      expect(editSan3Presence(document, previewedEditorChanges(first))).toEqual(first);
      expect(() =>
        editSan3Presence(document, { [`presenceEffect.${index}.portrait`]: 277 }),
      ).toThrow();
    }
  });

  it("rejects malformed definitions, pending state, blocked destinations and mixed invalid drafts", () => {
    const original = fixture();
    for (const [offset, width, value] of [
      [definition(10) + 13, 1, 0],
      [definition(10) + 20, 1, 0],
      [definition(10) + 4, 1, 0],
      [definition(10) + 5, 1, 101],
      [definition(10) + 3, 1, 2],
      [definition(10) + 11, 1, 32],
      [officer(542), 2, 1],
      [officer(542) + 2, 2, 1],
      [officer(542) + 8, 1, 16],
      [officer(542) + 9, 1, 64],
      [officer(542) + 10, 1, 1],
      [officer(542) + 16, 1, 4],
      [officer(542) + 17, 1, 1],
      [officer(542) + 21, 1, 1],
    ] as const) {
      const bytes = original.slice();
      const data = new DataView(bytes.buffer);
      if (width === 1) data.setUint8(offset, value);
      else data.setUint16(offset, value);
      const document = new San3Document(bytes);
      expect(() => setSan3OfficerPresence(document, 542, 4, 1)).toThrow();
      expect(document.copy()).toEqual(bytes);
    }
    const document = new San3Document(original);
    expect(() => setSan3OfficerPresence(document, 542, 4, 4)).toThrow();
    expect(() =>
      editSan3Presence(document, {
        "presence.541.role": 4,
        "presence.541.city": 1,
        "presence.542.role": 4,
        "presence.542.city": 4,
      }),
    ).toThrow();
    expect(document.copy()).toEqual(original);
  });
});
