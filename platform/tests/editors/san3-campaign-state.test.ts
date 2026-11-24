import { describe, expect, it } from "vitest";
import {
  campaignStateFields,
  editSan3CampaignState,
} from "../../src/editors/san3/campaign-state.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { governanceOfficer as officer, san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 coherent monthly campaign states", () => {
  it("starts an injury, adjusts its countdown and clears its hold flag at zero", () => {
    const original = Buffer.from(san3GovernanceFixture());
    const document = new San3Document(original);
    const started = editSan3CampaignState(document, { "state.1.recoveryMonths": 7 });
    expect(started.bytes[officer(1) + 9]).toBe(0x8f);
    expect(started.changes).toEqual({ "state.1.recoveryMonths": 7 });
    expect(started.preview[0]?.key).toBe("state.1.recoveryMonths");
    const adjusted = editSan3CampaignState(new San3Document(started.bytes), {
      "state.1.recoveryMonths": 1,
    });
    expect(adjusted.bytes[officer(1) + 9]).toBe(0x89);
    const finished = editSan3CampaignState(new San3Document(adjusted.bytes), {
      "state.1.recoveryMonths": 0,
    });
    expect(finished.bytes).toEqual(new Uint8Array(original));
    expect(document.copy()).toEqual(new Uint8Array(original));
    const retreat = san3GovernanceFixture();
    retreat[officer(1) + 9] = 0xa2;
    expect(
      editSan3CampaignState(new San3Document(retreat), { "state.1.recoveryMonths": 3 }).bytes[
        officer(1) + 9
      ],
    ).toBe(0xa3);
  });

  it("changes active infiltration counters and valid prior allegiance without changing current membership", () => {
    const bytes = san3GovernanceFixture();
    bytes[officer(9) + 11] = 0xeb;
    bytes[officer(9) + 19] = 0;
    bytes[officer(9) + 20] = 10;
    const result = editSan3CampaignState(new San3Document(bytes), {
      "state.9.infiltrationMonths": 7,
      "state.9.originFaction": 1,
    });
    expect(result.bytes[officer(9) + 11]).toBe(0xef);
    expect(result.bytes[officer(9) + 19]).toBe(1);
    expect(result.bytes[officer(9) + 17]).toBe(255);
    expect(result.writes.map(({ offset }) => offset)).toEqual([officer(9) + 11, officer(9) + 19]);
    expect(() =>
      editSan3CampaignState(new San3Document(bytes), { "state.9.originFaction": 255 }),
    ).toThrow();
    bytes[officer(9) + 20] = 0;
    expect(() =>
      editSan3CampaignState(new San3Document(bytes), { "state.9.originFaction": 1 }),
    ).not.toThrow();
    bytes[officer(1) + 11] = 0xe8;
    bytes[officer(1) + 19] = 1;
    expect(() =>
      editSan3CampaignState(new San3Document(bytes), { "state.1.infiltrationMonths": 7 }),
    ).toThrow();
    bytes[officer(1) + 18] = 2;
    bytes[officer(1) + 20] = 255;
    expect(() =>
      editSan3CampaignState(new San3Document(bytes), { "state.1.infiltrationMonths": 7 }),
    ).toThrow();
  });

  it("creates and cancels only the native pending drive-tiger plan", () => {
    const original = san3GovernanceFixture();
    const result = editSan3CampaignState(new San3Document(original), {
      "state.1.rebellionFaction": 1,
    });
    expect(result.bytes[officer(1) + 8]).toBe(0x88);
    expect(result.bytes[officer(1) + 19]).toBe(1);
    expect(result.writes).toHaveLength(2);
    const cancelled = editSan3CampaignState(new San3Document(result.bytes), {
      "state.1.rebellionFaction": 255,
    });
    expect(cancelled.bytes[officer(1) + 8]).toBe(0x80);
    expect(cancelled.bytes[officer(1) + 19]).toBe(1);
    expect(cancelled.writes).toHaveLength(1);
    expect(() =>
      editSan3CampaignState(new San3Document(original), { "state.0.rebellionFaction": 1 }),
    ).toThrow();
    expect(() =>
      editSan3CampaignState(new San3Document(original), { "state.1.rebellionFaction": 0 }),
    ).toThrow();
  });

  it("rejects dead, battling, hidden, assigned, inactive-origin and conflicting state edits", () => {
    const original = san3GovernanceFixture();
    for (const changes of [
      { "state.1.recoveryMonths": 8 },
      { "state.1.recoveryMonths": -1 },
      { "state.1.recoveryMonths": 1.5 },
      { "state.1.infiltrationMonths": 1 },
      { "state.1.originFaction": 1 },
      { "state.1.rebellionFaction": 2 },
      { "state.1.rebellionFaction": 21 },
      { "state.10.recoveryMonths": 1 },
      { "state.600.recoveryMonths": 1 },
      { "state.01.recoveryMonths": 1 },
    ])
      expect(() => editSan3CampaignState(new San3Document(original), changes)).toThrow();
    for (const [offset, value] of [
      [8, 0x84],
      [8, 0x90],
      [9, 0xc0],
      [26, 1],
      [27, 1],
    ] as const) {
      const bytes = original.slice();
      bytes[officer(1) + offset] = value;
      expect(() =>
        editSan3CampaignState(new San3Document(bytes), { "state.1.recoveryMonths": 2 }),
      ).toThrow();
    }
    const covert = original.slice();
    covert[officer(1) + 11] = 0xf8;
    covert[officer(1) + 19] = 1;
    expect(
      campaignStateFields(new San3Document(covert), 1).find(
        ({ columnId }) => columnId === "infiltrationMonths",
      )?.readonly,
    ).toBe(true);
    expect(() =>
      editSan3CampaignState(new San3Document(covert), { "state.1.rebellionFaction": 1 }),
    ).toThrow();
    covert[officer(0) + 11] = 0xe8;
    covert[officer(0) + 19] = 1;
    expect(() =>
      editSan3CampaignState(new San3Document(covert), { "state.0.infiltrationMonths": 7 }),
    ).toThrow();
  });

  it("leaves every original byte unchanged when a later request fails and filters no-op intentions", () => {
    const original = Buffer.from(san3GovernanceFixture());
    const document = new San3Document(original);
    expect(() =>
      editSan3CampaignState(document, {
        "state.1.recoveryMonths": 2,
        "state.2.rebellionFaction": 99,
      }),
    ).toThrow();
    expect(document.copy()).toEqual(new Uint8Array(original));
    expect(original).toEqual(Buffer.from(san3GovernanceFixture()));
    const noOp = editSan3CampaignState(document, {
      "state.1.recoveryMonths": 0,
      "state.1.rebellionFaction": 255,
    });
    expect(noOp.writes).toEqual([]);
    expect(noOp.preview).toEqual([]);
    expect(noOp.changes).toEqual({});
  });
});
