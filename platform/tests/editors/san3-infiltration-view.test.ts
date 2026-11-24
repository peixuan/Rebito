import { describe, expect, it } from "vitest";
import { San3Document } from "../../src/editors/san3/document.ts";
import { deploySan3Infiltrator } from "../../src/editors/san3/infiltration.ts";
import {
  san3InfiltrationDraft,
  san3InfiltrationFields,
} from "../../src/editors/san3/infiltration-view.ts";
import { governanceOfficer as officer, san3GovernanceFixture } from "./san3-governance-fixture.ts";

function fixture() {
  const bytes = san3GovernanceFixture();
  new DataView(bytes.buffer).setUint16(officer(2) + 2, 0);
  bytes[officer(2) + 18] = 7;
  bytes[officer(2) + 20] = 17;
  return bytes;
}

describe("SAN3 covert operation fields and canonical previews", () => {
  it("names foreign choices and exposes dependent service bounds without mutating the snapshot", () => {
    const document = new San3Document(fixture());
    const fields = san3InfiltrationFields(document, 2);
    expect(fields.find(({ columnId }) => columnId === "deployCity")).toMatchObject({
      readonly: false,
      choices: [{ value: 0 }, { value: 4 }],
    });
    expect(fields.find(({ columnId }) => columnId === "establishFaction")).toMatchObject({
      readonly: false,
      choices: [{ value: 0 }, { value: 2, label: { messageId: "san3.factionOf" } }],
    });
    expect(fields.find(({ columnId }) => columnId === "priorServiceYears")).toMatchObject({
      value: 0,
      min: 0,
      max: 249,
      enabledByField: "infiltration.2.establishFaction",
    });
    expect(fields.find(({ columnId }) => columnId === "end")?.readonly).toBe(true);
    expect(document.copy()).toEqual(fixture());
  });

  it("previews deployment, removed advisory office and native dependent effects with replayable intent", () => {
    const original = Buffer.from(fixture());
    const document = new San3Document(original);
    const result = san3InfiltrationDraft(document, { "infiltration.2.deployCity": 4 });
    expect(result.changes).toEqual({ "infiltration.2.deployCity": 4 });
    expect(result.preview[0]).toMatchObject({
      key: "infiltration.2.deployCity",
      after: { messageId: "san3.cityRecord", parameters: { index: 4 } },
    });
    expect(result.preview.map(({ key }) => key)).toEqual([
      "infiltration.2.deployCity",
      "infiltrationEffect.2.infiltration",
      "infiltrationEffect.2.role",
      "infiltrationEffect.2.loyalty",
      "infiltrationEffect.2.city",
      "infiltrationEffect.2.faction",
      "infiltrationEffect.2.serviceYears",
      "infiltrationEffect.2.originFaction",
      "infiltrationEffect.2.originServiceYears",
      "infiltrationEffect.2.training",
      "infiltrationEffect.2.morale",
      "infiltrationEffect.2.advisor",
    ]);
    const effects = Object.fromEntries(result.preview.map(({ key, ...effect }) => [key, effect]));
    expect(effects["infiltrationEffect.2.city"]?.label).toMatchObject({
      messageId: "editor.columnLabel",
      parameters: { field: { messageId: "san3.location" } },
    });
    expect(san3InfiltrationDraft(document, result.changes).bytes).toEqual(result.bytes);
    expect(document.copy()).toEqual(new Uint8Array(original));
    expect(original).toEqual(Buffer.from(fixture()));
  });

  it("keeps faction zero selectable and displays exactly the prior-service replacement", () => {
    const bytes = fixture();
    bytes[officer(7) + 18] = 0;
    const document = new San3Document(bytes);
    const prior = san3InfiltrationFields(document, 7).find(
      ({ columnId }) => columnId === "priorServiceYears",
    );
    expect(prior).toMatchObject({ value: 1, min: 1, max: 255 });
    const result = san3InfiltrationDraft(document, {
      "infiltration.7.establishFaction": 1,
      "infiltration.7.priorServiceYears": 255,
    });
    expect(result.changes).toEqual({
      "infiltration.7.establishFaction": 1,
      "infiltration.7.priorServiceYears": 255,
    });
    expect(result.bytes[officer(7) + 19]).toBe(0);
    expect(result.bytes[officer(7) + 20]).toBe(255);
    const defaulted = san3InfiltrationDraft(new San3Document(fixture()), {
      "infiltration.2.establishFaction": 2,
    });
    expect(defaulted.changes).toEqual({ "infiltration.2.establishFaction": 2 });
    expect(defaulted.preview.find(({ key }) => key.endsWith("originServiceYears"))).toMatchObject({
      before: 17,
      after: 0,
    });
    expect(defaulted.preview.some(({ key }) => key.endsWith(".city"))).toBe(false);
  });

  it("lets waiting free agents end affiliation without recruiting them or changing retained service", () => {
    const deployed = deploySan3Infiltrator(new San3Document(fixture()), 2, 3);
    const document = new San3Document(deployed.bytes);
    expect(document.officer(2).available).toBe(false);
    expect(
      san3InfiltrationFields(document, 2).find(({ columnId }) => columnId === "end"),
    ).toMatchObject({
      readonly: false,
      boolean: true,
    });
    const result = san3InfiltrationDraft(document, { "infiltration.2.end": 1 });
    expect(result.changes).toEqual({ "infiltration.2.end": 1 });
    expect(result.preview.map(({ key }) => key)).toEqual([
      "infiltration.2.end",
      "infiltrationEffect.2.infiltration",
      "infiltrationEffect.2.originFaction",
    ]);
    expect(result.bytes[officer(2) + 12]).toBe(5);
    expect(result.bytes[officer(2) + 20]).toBe(7);
  });

  it("normalizes placeholders and rejects mixed, unavailable or invalid operations atomically", () => {
    const document = new San3Document(fixture());
    for (const changes of [
      {},
      { "infiltration.2.deployCity": 0, "infiltration.2.end": 0 },
      { "infiltration.2.priorServiceYears": 0 },
    ])
      expect(san3InfiltrationDraft(document, changes)).toMatchObject({ changes: {}, preview: [] });
    for (const changes of [
      { "infiltration.2.deployCity": 4, "infiltration.2.establishFaction": 2 },
      { "infiltration.2.deployCity": 4, "infiltration.2.priorServiceYears": 3 },
      { "infiltration.2.priorServiceYears": 1 },
      { "infiltration.2.deployCity": 4, "infiltration.7.end": 0 },
      { "infiltration.2.deployCity": 1 },
      { "infiltration.2.deployCity": 5 },
      { "infiltration.2.establishFaction": 3 },
      { "infiltration.2.establishFaction": 2, "infiltration.2.priorServiceYears": 250 },
      { "infiltration.2.end": 1 },
      { "infiltration.2.end": 2 },
      { "infiltration.2.deployCity": -1 },
      { "infiltration.2.deployCity": 4.5 },
      { "infiltration.2.deployCity": 4, "officer.2.loyalty": 100 },
      { "infiltration.2.raw": 8 },
      { "infiltration.02.deployCity": 4 },
      { "infiltration.600.deployCity": 4 },
      { "infiltration.0.establishFaction": 2 },
    ])
      expect(() => san3InfiltrationDraft(document, changes)).toThrow();
    expect(document.copy()).toEqual(fixture());
  });

  it("keeps incomplete chains inspectable while refusing covert operations", () => {
    const bytes = fixture();
    new DataView(bytes.buffer).setUint16(officer(1), 1);
    const document = new San3Document(bytes);
    expect(san3InfiltrationFields(document, 2)).toEqual([]);
    expect(() => san3InfiltrationDraft(document, { "infiltration.2.deployCity": 4 })).toThrow();
  });
});
