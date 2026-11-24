import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { editSan3Tasks, inspectSan3Task } from "../../src/editors/san3/campaign-tasks.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { editSan3TaskJoin, san3TaskJoinFields } from "../../src/editors/san3/task-joining.ts";
import { san3TaskDraft, san3TaskFields } from "../../src/editors/san3/task-view.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

function fixture() {
  const bytes = san3GovernanceFixture();
  const data = new DataView(bytes.buffer);
  bytes[city(0) + 24] = 2;
  for (const index of [1, 2]) {
    bytes[officer(index) + 9] = 0xc0;
    bytes[officer(index) + 26] = 1;
    bytes[officer(index) + 27] = 0x24;
    data.setUint16(officer(index) + 28, 0x1218);
  }
  return bytes;
}

describe("SAN3 explicit shared task membership", () => {
  it("offers one named choice per eligible same-city group only for idle officers", () => {
    const document = new San3Document(fixture());
    expect(san3TaskJoinFields(document, 0)).toMatchObject([
      {
        key: "task.0.joinGroup",
        value: 65535,
        choices: [
          { value: 65535, label: { messageId: "san3.none" } },
          {
            value: 1,
            label: {
              messageId: "san3.taskJoinChoice",
              parameters: { count: 2, task: { messageId: "san3.taskKind1" } },
            },
          },
        ],
      },
    ]);
    for (const index of [1, 3, 9, 600]) expect(san3TaskJoinFields(document, index)).toEqual([]);
    expect(san3TaskFields(document, 0).at(-1)?.key).toBe("task.0.joinGroup");
  });

  it("copies the exact shared clock/result and previews action consumption without changing existing members", () => {
    const original = Buffer.from(fixture());
    const document = new San3Document(original);
    const changes = { "task.0.joinGroup": 1 };
    const result = san3TaskDraft(document, changes);
    const after = new San3Document(result.bytes);
    expect(inspectSan3Task(after, 0)).toMatchObject({
      kind: 1,
      totalMonths: 4,
      elapsedMonths: 2,
      effect: 24,
      members: [0, 1, 2],
    });
    expect(after.read(officer(0) + 28, 2)).toBe(0x1218);
    expect(result.changes).toEqual(changes);
    expect(result.preview.map(({ key }) => key)).toEqual([
      "task.0.joinGroup",
      "taskJoinEffect.0.members",
      "taskJoinEffect.0.task",
      "taskEffect.0.actionComplete",
    ]);
    expect(result.preview.at(-1)).toMatchObject({ before: 0, after: 1 });
    for (const index of [1, 2])
      expect(result.bytes.slice(officer(index), officer(index) + 30)).toEqual(
        new Uint8Array(original.subarray(officer(index), officer(index) + 30)),
      );
    const restored = result.bytes.slice();
    for (const relative of [8, 9, 26, 27, 28, 29])
      restored[officer(0) + relative] = original[officer(0) + relative] as number;
    expect(restored).toEqual(new Uint8Array(original));
    expect(san3TaskDraft(document, result.changes).bytes).toEqual(result.bytes);
    expect(original).toEqual(Buffer.from(fixture()));
  });

  it("creates a group through the existing first-member assignment for every shared native task", () => {
    for (const kind of [0, 1, 2, 3, 4, 5, 6, 8]) {
      const initial = new San3Document(san3GovernanceFixture());
      const started = editSan3Tasks(initial, { "task.1.kind": kind, "task.1.totalMonths": 3 });
      const result = editSan3TaskJoin(new San3Document(started.bytes), { "task.0.joinGroup": 1 });
      expect(inspectSan3Task(new San3Document(result.bytes), 0)).toMatchObject({
        kind,
        members: [0, 1],
        totalMonths: 3,
      });
    }
    const spy = editSan3Tasks(new San3Document(san3GovernanceFixture()), {
      "task.1.kind": 7,
      "task.1.targetCity": 3,
    });
    expect(san3TaskJoinFields(new San3Document(spy.bytes), 0)).toEqual([]);
    expect(() =>
      editSan3TaskJoin(new San3Document(spy.bytes), { "task.0.joinGroup": 1 }),
    ).toThrow();
  });

  it("accepts a tenth participant and refuses an eleventh without changing bytes", () => {
    const bytes = fixture();
    const data = new DataView(bytes.buffer);
    const members = [0, 1, 2, 11, 12, 13, 14, 15, 16, 17, 18];
    for (const [position, index] of members.entries()) {
      const base = officer(index);
      data.setUint16(base, members[position + 1] ?? 65535);
      if (index >= 11) bytes[base + 12] = 3;
      bytes[base + 16] = 0;
      bytes[base + 17] = 0;
      bytes[base + 9] = position < 9 ? 0xc0 : 0x80;
      bytes[base + 26] = position < 9 ? 1 : 255;
      bytes[base + 27] = position < 9 ? 2 : 0;
      data.setUint16(base + 28, position < 9 ? 10 : 0);
    }
    const result = editSan3TaskJoin(new San3Document(bytes), { "task.17.joinGroup": 0 });
    expect(inspectSan3Task(new San3Document(result.bytes), 17).members).toHaveLength(10);
    const full = new San3Document(result.bytes);
    expect(san3TaskJoinFields(full, 18)).toEqual([]);
    expect(() => editSan3TaskJoin(full, { "task.18.joinGroup": 0 })).toThrow();
    expect(full.copy()).toEqual(result.bytes);
  });

  it("rejects mixed workflows, busy or inconsistent members and unsafe source results", () => {
    const document = new San3Document(fixture());
    for (const changes of [
      { "task.0.joinGroup": 1, "task.0.kind": 1 },
      { "task.0.joinGroup": 1, "task.3.joinGroup": 1 },
      { "task.0.joinGroup": 3 },
      { "task.3.joinGroup": 1 },
      { "task.0.joinGroup": 600 },
      { "task.0.joinGroup": 1.5 },
      { "task.00.joinGroup": 1 },
      { "task.600.joinGroup": 1 },
    ])
      expect(() => san3TaskDraft(document, changes)).toThrow();
    for (const [offset, value] of [
      [officer(0) + 8, 0x84],
      [officer(0) + 8, 0x88],
      [officer(0) + 9, 0x81],
      [officer(0) + 9, 0x88],
      [officer(0) + 10, 0x71],
      [officer(2) + 27, 0x13],
      [officer(1) + 29, 255],
      [city(0) + 24, 0],
    ] as const) {
      const bytes = fixture();
      bytes[offset] = value;
      const invalid = new San3Document(bytes);
      expect(san3TaskJoinFields(invalid, 0)).toEqual([]);
      expect(() => editSan3TaskJoin(invalid, { "task.0.joinGroup": 1 })).toThrow();
      expect(invalid.copy()).toEqual(bytes);
    }
    expect(document.copy()).toEqual(fixture());
  });

  it("keeps None as a canonical no-op and does not invent an already-completed action change", () => {
    const bytes = fixture();
    bytes[officer(0) + 8] = 0x81;
    const document = new San3Document(bytes);
    const noOp = editSan3TaskJoin(document, { "task.0.joinGroup": 65535 });
    expect(noOp).toMatchObject({ changes: {}, preview: [] });
    expect(noOp.bytes).toEqual(bytes);
    const result = editSan3TaskJoin(document, { "task.0.joinGroup": 1 });
    expect(result.preview.some(({ key }) => key.endsWith("actionComplete"))).toBe(false);
  });

  it("retains replayable intent across records and tabs and lets the preview selector cancel", () => {
    const bytes = fixture();
    const changes = { "task.0.joinGroup": 1 };
    let view = san3Adapter.view(bytes, { module: "officers", record: "0", changes });
    expect(view.fields.find(({ key }) => key === "task.0.joinGroup")?.value).toBe(1);
    expect(
      view.fields.filter(
        ({ help }) => typeof help === "object" && help.messageId === "san3.taskGroupHelp",
      ),
    ).toHaveLength(1);
    for (const [module, record] of [
      ["officers", "2"],
      ["cities", "0"],
      ["officers", "0"],
    ] as const) {
      view = san3Adapter.view(bytes, { module, record, changes: previewedEditorChanges(view) });
      expect(previewedEditorChanges(view)).toEqual(changes);
    }
    const applied = san3Adapter.apply(bytes, { changes: previewedEditorChanges(view) });
    expect(inspectSan3Task(new San3Document(applied), 0).members).toEqual([0, 1, 2]);
    const cancelled = san3Adapter.view(bytes, {
      module: "officers",
      record: "0",
      changes: { "task.0.joinGroup": 65535 },
    });
    expect(cancelled.changes).toEqual({});
    expect(cancelled.preview).toEqual([]);
    expect(inspectSan3Task(new San3Document(bytes), 0).kind).toBe(255);
    const switched = san3TaskDraft(new San3Document(bytes), {
      "task.0.joinGroup": 65535,
      "task.0.kind": 6,
    });
    expect(switched.changes).toEqual({ "task.0.kind": 6 });
    expect(inspectSan3Task(new San3Document(switched.bytes), 0).kind).toBe(6);
  });
});
