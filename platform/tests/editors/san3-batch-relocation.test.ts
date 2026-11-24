import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { san3OperationFields } from "../../src/editors/san3/operation-fields.ts";
import { inspectSan3Lists, relocateSan3Officers } from "../../src/editors/san3/relocation.ts";
import { governanceOfficer, san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 batch relocation and actionable eligibility", () => {
  const draft = {
    module: "officers",
    record: "1",
    changes: { "move.1.city": 4 },
    action: { id: "copy-fields", record: "1", targets: ["4", "2"] },
  };

  it("publishes canonical moves together with roster and army side effects", () => {
    const bytes = Buffer.from(san3GovernanceFixture());
    const before = Buffer.from(bytes);
    const initial = san3Adapter.view(bytes, { module: "officers", record: "1" });
    expect(initial.batchKeys).toContain("move.1.city");
    const view = san3Adapter.view(bytes, draft);
    expect(view.changes).toEqual({ "move.1.city": 4, "move.2.city": 4, "move.4.city": 4 });
    for (const index of [1, 2, 4])
      expect(view.preview).toContainEqual(
        expect.objectContaining({ key: `move.${index}.soldiers`, before: 3000, after: 0 }),
      );
    const result = new San3Document(san3Adapter.apply(bytes, { changes: view.changes }));
    const graph = inspectSan3Lists(result);
    expect(graph.cities[4]?.free).toEqual([9, 1, 2, 4]);
    expect(graph.cities[0]?.advisor).toBe(0xffff);
    expect(graph.cities[1]?.advisor).toBe(0xffff);
    for (const index of [1, 2, 4])
      expect(result.officer(index)).toMatchObject({
        city: 4,
        faction: 255,
        role: 5,
        soldiers: 0,
        training: 0,
        morale: 0,
      });
    expect(bytes).toEqual(before);
    expect(result.read(123, 1)).toBe(219);
  });

  it("rejects a mixed eligible/ineligible batch without changing any input", () => {
    const bytes = san3GovernanceFixture();
    const before = bytes.slice();
    for (const target of ["0", "3", "599"])
      expect(() =>
        san3Adapter.apply(bytes, {
          ...draft,
          action: { ...draft.action, targets: ["2", target] },
        }),
      ).toThrow();
    expect(() =>
      san3Adapter.apply(bytes, {
        ...draft,
        changes: { ...draft.changes, "officer.1.loyalty": 90 },
      }),
    ).toThrow();
    expect(bytes).toEqual(before);
  });

  it("shows the same specific blocker enforced by publication", () => {
    const cases = [
      [0, 0, 0, "relocationRuler"],
      [3, 0, 0, "relocationGovernor"],
      [599, 0, 0, "relocationNoRoster"],
      [1, 8, 0x84, "relocationBattleOrDead"],
      [1, 8, 0x90, "relocationBattleOrDead"],
      [1, 8, 0x88, "relocationTask"],
      [1, 26, 1, "relocationTask"],
      [1, 27, 0x21, "relocationTask"],
      [1, 9, 0x81, "relocationStatus"],
      [1, 10, 0x71, "relocationEquipment"],
      [1, 11, 0xe1, "relocationEquipment"],
    ] as const;
    for (const [index, relative, value, reason] of cases) {
      const bytes = san3GovernanceFixture();
      if (relative) bytes[governanceOfficer(index) + relative] = value;
      const document = new San3Document(bytes);
      expect(san3OperationFields(document, "officers", index)[0]).toMatchObject({
        readonly: true,
        help: {
          messageId: "san3.relocationBlocked",
          parameters: { reason: { messageId: `san3.${reason}` } },
        },
      });
      expect(() => relocateSan3Officers(document, [index], 4)).toThrow(`san3.${reason}`);
    }
  });
});
