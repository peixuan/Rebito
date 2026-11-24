import { describe, expect, it } from "vitest";
import { San3Document } from "../../src/editors/san3/document.ts";
import { san3StateDraft, san3StateFields } from "../../src/editors/san3/state-view.ts";
import { governanceOfficer as officer, san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 state workflow fields and canonical previews", () => {
  it("shows waiting free-agent controls and names faction choices", () => {
    const bytes = san3GovernanceFixture();
    bytes[officer(9) + 11] = 0xe8;
    bytes[officer(9) + 19] = 0;
    bytes[officer(9) + 20] = 1;
    const document = new San3Document(bytes);
    expect(document.officer(9).available).toBe(false);
    const fields = san3StateFields(document, 9);
    expect(fields.find(({ columnId }) => columnId === "infiltrationMonths")?.readonly).toBe(false);
    expect(fields.find(({ columnId }) => columnId === "rebellionFaction")?.readonly).toBe(true);
    expect(
      fields.find(({ columnId }) => columnId === "originFaction")?.choices?.[0]?.label,
    ).toMatchObject({ messageId: "san3.factionOf" });
    expect(fields.every(({ key }) => key.startsWith("state.9."))).toBe(true);
  });

  it("preserves actionable intent keys while previewing the dependent injury state", () => {
    const document = new San3Document(san3GovernanceFixture());
    const result = san3StateDraft(document, { "state.1.recoveryMonths": 2 });
    expect(result.changes).toEqual({ "state.1.recoveryMonths": 2 });
    expect(result.preview.map(({ key }) => key)).toEqual([
      "state.1.recoveryMonths",
      "stateEffect.1.recoveryState",
    ]);
    expect(result.preview[0]?.label).toMatchObject({
      messageId: "editor.columnLabel",
      parameters: { field: { messageId: "san3.recoveryMonths" } },
    });
    expect(san3StateDraft(document, result.changes).bytes).toEqual(result.bytes);
    const noOp = san3StateDraft(new San3Document(result.bytes), result.changes);
    expect(noOp.changes).toEqual({});
    expect(noOp.preview).toEqual([]);
  });

  it("names a pending plan's faction and distinguishes cancellation from its retained origin", () => {
    const document = new San3Document(san3GovernanceFixture());
    const result = san3StateDraft(document, { "state.1.rebellionFaction": 1 });
    expect(result.preview.map(({ key }) => key)).toEqual([
      "state.1.rebellionFaction",
      "stateEffect.1.rebellion",
      "stateEffect.1.originFaction",
    ]);
    expect(result.preview[0]?.after).toMatchObject({ messageId: "san3.factionOf" });
    const cancelled = san3StateDraft(new San3Document(result.bytes), {
      "state.1.rebellionFaction": 255,
    });
    expect(cancelled.preview.map(({ key }) => key)).toEqual([
      "state.1.rebellionFaction",
      "stateEffect.1.rebellion",
    ]);
    expect(cancelled.bytes[officer(1) + 19]).toBe(1);
  });

  it("rejects mixed/raw keys and keeps original bytes immutable on failed drafts", () => {
    const original = Buffer.from(san3GovernanceFixture());
    const document = new San3Document(original);
    for (const changes of [
      { "state.1.recoveryMonths": 2, "officer.1.loyalty": 100 },
      { "state.1.dead": 1 },
      { "state.1.recoveryMonths": 8 },
    ])
      expect(() => san3StateDraft(document, changes)).toThrow();
    expect(document.copy()).toEqual(new Uint8Array(original));
    expect(original).toEqual(Buffer.from(san3GovernanceFixture()));
  });

  it("hides structural controls on an incomplete officer chain without allowing writes", () => {
    const bytes = san3GovernanceFixture();
    new DataView(bytes.buffer).setUint16(officer(1), 1);
    const document = new San3Document(bytes);
    expect(san3StateFields(document, 1)).toEqual([]);
    expect(() => san3StateDraft(document, { "state.1.recoveryMonths": 2 })).toThrow();
  });
});
