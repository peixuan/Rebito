import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { editSan3Appointments } from "../../src/editors/san3/appointment-draft.ts";
import { san3AppointmentFields } from "../../src/editors/san3/appointment-fields.ts";
import { appointSan3Officer } from "../../src/editors/san3/appointments.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";

function fixture() {
  const bytes = new Uint8Array(san3Layout.size);
  const data = new DataView(bytes.buffer);
  data.setUint32(0x78000, 0x4b4f4549);
  data.setUint32(0x78776, 0x4b4f4549);
  data.setUint16(0x78788, 200);
  for (let index = 0; index < 21; index++)
    data.setUint16(san3Layout.factions.offset + index * 50, index === 0 ? 0 : 0xffff);
  data.setUint32(san3Layout.factions.offset + 2, san3Layout.cities.offset);
  for (let index = 0; index < 46; index++) {
    const base = san3Layout.cities.offset + index * 52;
    for (const relative of [4, 6, 8, 10]) data.setUint16(base + relative, 0xffff);
    bytes[base + 20] = index === 0 ? 0 : 255;
  }
  data.setUint16(san3Layout.cities.offset + 4, 0);
  for (let index = 0; index < 600; index++) {
    const base = san3Layout.officers.offset + index * 30;
    data.setUint16(base, index === 0 ? 1 : 0xffff);
    bytes[base + 12] = index === 0 ? 0 : index === 1 ? 3 : 7;
  }
  const attributes = new San3Document(bytes).attributeOffset(1);
  bytes.fill(85, attributes, attributes + 6);
  return bytes;
}

describe("SAN3 appointment presentation", () => {
  it("validates complete preview drafts and preserves canonical role and advisor intents", () => {
    const bytes = fixture();
    const advisorField = "appointment.1.advisor";
    const changes = { "appointment.1.role": 1, [advisorField]: 1 };
    const view = san3Adapter.view(bytes, { module: "officers", record: "1", changes });
    expect(view.changes).toEqual(changes);
    expect(previewedEditorChanges(view)).toEqual(changes);
    expect(
      view.fields.filter(
        ({ label }) => typeof label === "object" && label.messageId === "san3.role",
      ),
    ).toHaveLength(1);
    expect(view.fields.find(({ key }) => key === advisorField)).toMatchObject({
      value: 1,
      readonly: false,
    });
    expect(view.batchKeys).not.toContain("appointment.1.role");
    expect(view.preview).toHaveLength(2);
    const next = new San3Document(san3Adapter.apply(bytes, { changes: view.changes }));
    expect(next.officer(1).role).toBe(1);
    expect(next.read(san3Layout.cities.offset + 10, 2)).toBe(1);
    const noop = editSan3Appointments(next, changes);
    expect(noop.changes).toEqual({});
    expect(noop.preview).toEqual([]);
    expect(noop.bytes).toEqual(next.copy());
    for (const extra of [
      { "move.1.city": 1 },
      { "ruler.0.officer": 1 },
      { "lifecycle.1.turncoatMonths": 3 },
    ])
      expect(() => san3Adapter.apply(bytes, { changes: { ...changes, ...extra } })).toThrow();
    for (const draft of [
      { "appointment.600.role": 1 },
      { "appointment.01.role": 1 },
      { "appointment.1.role": 0 },
      { "appointment.1.role": 1.5 },
      { "appointment.1.advisor": 2 },
      { "appointment.1.advisor": 1 },
      { "appointment.1.unknown": 1 },
    ])
      expect(() => editSan3Appointments(new San3Document(bytes), draft)).toThrow();
  });

  it("rejects competing explicit advisor assignments rather than silently taking the last", () => {
    const bytes = fixture();
    const data = new DataView(bytes.buffer);
    const base = san3Layout.officers.offset;
    data.setUint16(base + 30, 2);
    bytes[base + 60 + 12] = 1;
    const document = new San3Document(bytes);
    bytes.fill(85, document.attributeOffset(2), document.attributeOffset(2) + 6);
    expect(() =>
      editSan3Appointments(new San3Document(bytes), {
        "appointment.1.role": 1,
        "appointment.1.advisor": 1,
        "appointment.2.advisor": 1,
      }),
    ).toThrow();
    expect(new San3Document(bytes).officer(1).role).toBe(3);
    bytes[base + 30 + 12] = 1;
    data.setUint16(san3Layout.cities.offset + 10, 1);
    expect(() =>
      editSan3Appointments(new San3Document(bytes), {
        "appointment.1.advisor": 1,
        "appointment.2.advisor": 1,
      }),
    ).toThrow();
  });

  it("offers guarded roles and keeps a pending advisor assignment cancellable", () => {
    const document = new San3Document(fixture());
    const initial = san3AppointmentFields(document, 1);
    expect(initial[0]?.choices?.map(({ value }) => value)).toEqual([3, 1, 2, 4]);
    expect(initial[0]).toMatchObject({ value: 3, readonly: false });
    expect(initial[1]).toMatchObject({ value: 0, readonly: true });
    const appointed = new San3Document(appointSan3Officer(document, 1, 1, true).bytes);
    expect(san3AppointmentFields(appointed, 1)[1]).toMatchObject({ value: 0, readonly: true });
    expect(san3AppointmentFields(appointed, 1, 1)[1]).toMatchObject({
      value: 1,
      readonly: false,
      boolean: true,
    });
    const vacant = appointed.copy();
    new DataView(vacant.buffer).setUint16(san3Layout.cities.offset + 10, 0xffff);
    expect(san3AppointmentFields(new San3Document(vacant), 1)[1]?.readonly).toBe(false);
  });

  it("retains readable current roles for leaders, unlisted officers and malformed lists", () => {
    const document = new San3Document(fixture());
    expect(san3AppointmentFields(document, 0)[0]).toMatchObject({ value: 0, readonly: true });
    expect(san3AppointmentFields(document, 599)[0]).toMatchObject({ value: 7, readonly: true });
    const bytes = fixture();
    new DataView(bytes.buffer).setUint16(san3Layout.officers.offset + 30, 1);
    const fields = san3AppointmentFields(new San3Document(bytes), 1);
    expect(fields[0]).toMatchObject({ value: 3, readonly: true });
    expect(fields[0]?.choices).toEqual([{ value: 3, label: { messageId: "san3.role3" } }]);
    expect(fields[1]?.readonly).toBe(true);
    expect(() => san3AppointmentFields(document, 600)).toThrow();
  });
});
