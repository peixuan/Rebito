import { describe, expect, it } from "vitest";
import {
  editSan3Tasks,
  inspectSan3Task,
  taskFields,
} from "../../src/editors/san3/campaign-tasks.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

function fixture() {
  const bytes = san3GovernanceFixture();
  const data = new DataView(bytes.buffer);
  bytes[city(0) + 24] = 0x22;
  for (const index of [1, 2]) {
    const base = officer(index);
    bytes[base + 9] = 0xc0;
    bytes[base + 26] = 1;
    bytes[base + 27] = 0x24;
    data.setUint16(base + 28, 0x1218);
  }
  bytes[officer(0) + 9] = 0xc0;
  bytes[officer(0) + 26] = 5;
  bytes[officer(0) + 27] = 3;
  data.setUint16(officer(0) + 28, 2);
  return bytes;
}

describe("Japanese Mega-CD campaign task transactions", () => {
  it("updates every group member with final-batch clock validation and canonical intentions", () => {
    const original = Buffer.from(fixture());
    const document = new San3Document(original);
    const changes = { "task.1.elapsedMonths": 5, "task.1.totalMonths": 6, "task.1.effect": 27 };
    const result = editSan3Tasks(document, changes);
    expect(result.changes).toEqual(changes);
    expect(result.groups).toEqual([[1, 2]]);
    expect(result.preview.filter(({ key }) => key.startsWith("task."))).toHaveLength(3);
    expect(result.preview.filter(({ key }) => key.endsWith(".actionComplete"))).toMatchObject([
      { key: "taskEffect.1.actionComplete", before: 0, after: 1 },
      { key: "taskEffect.2.actionComplete", before: 0, after: 1 },
    ]);
    for (const index of [1, 2]) {
      expect(result.bytes[officer(index) + 27]).toBe(0x56);
      expect(result.bytes[officer(index) + 28]).toBe(0x12);
      expect(result.bytes[officer(index) + 29]).toBe(27);
      expect(result.bytes[officer(index) + 8]).toBe(0x81);
    }
    const restored = result.bytes.slice();
    const data = new DataView(restored.buffer);
    for (const { offset, width, before } of result.writes) {
      if (width === 1) data.setUint8(offset, before);
      else data.setUint16(offset, before);
    }
    expect(restored).toEqual(new Uint8Array(original));
    expect(document.copy()).toEqual(new Uint8Array(original));
    expect(original).toEqual(Buffer.from(fixture()));
  });

  it("cancels whole groups while preserving action flags, unrelated tasks and unknown bits", () => {
    const original = fixture();
    original[officer(1) + 8] = 0x81;
    const result = editSan3Tasks(new San3Document(original), { "task.1.kind": 255 });
    expect(result.bytes[city(0) + 24]).toBe(0x20);
    for (const index of [1, 2]) {
      expect(result.bytes[officer(index) + 9]).toBe(0x80);
      expect(result.bytes.slice(officer(index) + 26, officer(index) + 30)).toEqual(
        Uint8Array.of(255, 0, 0, 0),
      );
    }
    expect(result.bytes[officer(1) + 8]).toBe(0x81);
    expect(result.preview.some(({ key }) => key.endsWith(".actionComplete"))).toBe(false);
    expect(result.bytes.slice(officer(0), officer(0) + 30)).toEqual(
      original.slice(officer(0), officer(0) + 30),
    );
    expect(editSan3Tasks(new San3Document(result.bytes), { "task.1.kind": 255 }).writes).toEqual(
      [],
    );
  });

  it("starts a coherent task and switches its city task flag without charging resources", () => {
    const document = new San3Document(san3GovernanceFixture());
    const result = editSan3Tasks(document, { "task.3.kind": 6, "task.3.effect": 9999 });
    expect(inspectSan3Task(new San3Document(result.bytes), 3)).toMatchObject({
      kind: 6,
      totalMonths: 1,
      elapsedMonths: 0,
      effect: 9999,
      members: [3],
    });
    expect(result.bytes[city(1) + 24]).toBe(64);
    expect(result.preview.find(({ key }) => key === "taskEffect.3.actionComplete")).toMatchObject({
      before: 0,
      after: 1,
      label: {
        messageId: "editor.columnLabel",
        parameters: { field: { messageId: "san3.actionComplete" } },
      },
    });
    const switched = editSan3Tasks(new San3Document(result.bytes), {
      "task.3.kind": 5,
      "task.3.effect": 13,
    });
    expect(switched.bytes[city(1) + 24]).toBe(32);
    expect(switched.preview.some(({ key }) => key.endsWith(".actionComplete"))).toBe(false);
    expect(switched.bytes.slice(city(1) + 14, city(1) + 20)).toEqual(
      document.copy().slice(city(1) + 14, city(1) + 20),
    );
  });

  it("keeps spying independent and prevents packed destination corruption", () => {
    const document = new San3Document(san3GovernanceFixture());
    const result = editSan3Tasks(document, {
      "task.1.kind": 7,
      "task.1.targetCity": 3,
      "task.1.totalMonths": 15,
      "task.1.effect": 185,
      "task.2.kind": 7,
      "task.2.targetCity": 3,
      "task.2.totalMonths": 2,
      "task.2.effect": 250,
    });
    expect(result.bytes[city(0) + 24]).toBe(0);
    expect(inspectSan3Task(new San3Document(result.bytes), 1).members).toEqual([1]);
    expect(inspectSan3Task(new San3Document(result.bytes), 2).members).toEqual([2]);
    expect(new DataView(result.bytes.buffer).getUint16(officer(1) + 28)).toBe(0x03b9);
    for (const changes of [
      { "task.1.effect": 186 },
      { "task.1.targetCity": 0 },
      { "task.1.targetCity": 4 },
      { "task.1.targetCity": 46 },
    ])
      expect(() => editSan3Tasks(new San3Document(result.bytes), changes)).toThrow();
  });

  it("rejects overlapping groups, implicit merges and malformed records atomically", () => {
    const document = new San3Document(fixture());
    for (const changes of [
      { "task.1.effect": 1, "task.2.effect": 2 },
      { "task.1.kind": 5 },
      { "task.1.totalMonths": 2 },
      { "task.1.totalMonths": 16 },
      { "task.1.elapsedMonths": -1 },
      { "task.1.kind": 9 },
      { "task.1.kind": 8, "task.1.effect": 0 },
      { "task.1.kind": 255, "task.1.effect": 0 },
      { "task.1.targetCity": 3 },
      { "task.1.effect": 1.5 },
      { "task.600.kind": 0 },
      { "task.01.kind": 0 },
    ])
      expect(() => editSan3Tasks(document, changes)).toThrow();
    expect(document.copy()).toEqual(fixture());
    for (const [offset, value] of [
      [officer(2) + 27, 3],
      [officer(2) + 29, 99],
      [city(0) + 24, 0],
      [officer(1) + 8, 0x84],
      [officer(1) + 9, 0xc1],
      [officer(1) + 9, 0xc8],
      [officer(1) + 10, 0x71],
    ] as const) {
      const bytes = fixture();
      bytes[offset] = value;
      expect(() => editSan3Tasks(new San3Document(bytes), { "task.1.effect": 25 })).toThrow();
    }
  });

  it("uses task-specific safe result ranges and hides the unused treatment result", () => {
    const document = new San3Document(san3GovernanceFixture());
    for (const [kind, maximum] of [
      [0, 255],
      [1, 241],
      [2, 246],
      [3, 248],
      [4, 240],
      [5, 13],
      [6, 9999],
    ] as const) {
      expect(() =>
        editSan3Tasks(document, {
          "task.1.kind": kind,
          "task.1.totalMonths": 15,
          "task.1.effect": maximum,
        }),
      ).not.toThrow();
      expect(() =>
        editSan3Tasks(document, {
          "task.1.kind": kind,
          "task.1.totalMonths": 15,
          "task.1.effect": maximum + 1,
        }),
      ).toThrow();
      expect(
        taskFields(document, 1, { kind, totalMonths: 15 }).find(
          ({ columnId }) => columnId === "effect",
        )?.max,
      ).toBe(maximum);
    }
    expect(
      taskFields(document, 1, { kind: 8 }).find(({ columnId }) => columnId === "effect")?.readonly,
    ).toBe(true);
    expect(
      taskFields(document, 1, { kind: 7 }).some(({ columnId }) => columnId === "targetCity"),
    ).toBe(true);
    expect(editSan3Tasks(document, { "task.1.kind": 255 }).preview).toEqual([]);
  });

  it("records each shared city flag once so write metadata restores the original bytes", () => {
    const original = fixture();
    const result = editSan3Tasks(new San3Document(original), {
      "task.1.kind": 255,
      "task.0.kind": 255,
    });
    expect(result.writes.filter(({ offset }) => offset === city(0) + 24)).toEqual([
      { offset: city(0) + 24, width: 1, before: 0x22, after: 0 },
    ]);
  });
});
