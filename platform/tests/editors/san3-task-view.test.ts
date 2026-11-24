import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { inspectSan3Task } from "../../src/editors/san3/campaign-tasks.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 task previews", () => {
  it("offers named spy destinations and preserves explicit inputs through canonical replay", () => {
    const bytes = san3GovernanceFixture();
    const initial = san3Adapter.view(bytes, { module: "officers", record: "1" });
    const destination = initial.fields.find(({ key }) => key === "task.1.targetCity");
    expect(destination?.readonly).toBe(true);
    expect(destination?.choices?.map(({ value }) => value)).toEqual([0, 3]);
    const changes = { "task.1.kind": 7, "task.1.targetCity": 3, "task.1.totalMonths": 4 };
    const preview = san3Adapter.view(bytes, { module: "officers", record: "1", changes });
    expect(preview.changes).toEqual(changes);
    expect(preview.preview.find(({ key }) => key === "task.1.kind")?.after).toEqual({
      messageId: "san3.taskKind7",
    });
    expect(preview.preview.some(({ key }) => key === "taskMember.1")).toBe(true);
    expect(preview.fields.find(({ key }) => key === "task.1.targetCity")?.readonly).toBe(false);
    const result = san3Adapter.apply(bytes, { changes: preview.changes });
    expect(inspectSan3Task(new San3Document(result), 1)).toMatchObject({
      kind: 7,
      targetCity: 3,
      totalMonths: 4,
    });
    expect(bytes).toEqual(san3GovernanceFixture());
  });

  it("rejects mixed workflows and writes to derived participants without partial output", () => {
    const bytes = san3GovernanceFixture();
    for (const changes of [
      { "task.1.kind": 1, "move.1.city": 1 },
      { "task.1.kind": 1, "officer.1.morale": 10 },
      { "task.1.kind": 1, "taskMember.2": 1 },
      { "task.1.kind": 255 },
    ])
      expect(() => san3Adapter.apply(bytes, { changes })).toThrow();
    expect(bytes).toEqual(san3GovernanceFixture());
  });
});
