import { expect, it } from "vitest";
import { EiketsudenDocument } from "../../src/editors/eiketsuden/document.ts";
import { characterFields, editFields, findField } from "../../src/editors/eiketsuden/fields.ts";
import { parseEiketsudenRules } from "../../src/editors/eiketsuden/rules.ts";
import { eiketsudenFixture } from "./eiketsuden-fixture.ts";
import { eiketsudenRulesFixture } from "./eiketsuden-rules-fixture.ts";

const rules = parseEiketsudenRules(eiketsudenRulesFixture());
if (!rules) throw new Error("Invalid synthetic rules");

it("writes only the reviewed bytes and preserves scene data and unknown state", () => {
  const original = eiketsudenFixture();
  const document = new EiketsudenDocument(original);
  const { output, edits } = editFields(document, rules, {
    "campaign.0.money": 10_000,
    "characters.0.level": 99,
    "characters.0.experience": 98,
    "characters.383.troopClass": 18,
    "characters.0.item0": 255,
    "characters.383.item7": 62,
  });
  const expected = new Uint8Array(original);
  new DataView(expected.buffer).setUint16(35, 10_000, true);
  expected[1685 + 8] = 99;
  expected[1685 + 9] = 98;
  expected[1685 + 10] = 255;
  expected[0x2183 + 7] = 18;
  expected[0x2183 + 17] = 62;
  expect(output).toEqual(expected);
  expect(edits).toHaveLength(6);
  expect(document.copy()).toEqual(original);
  expect(new EiketsudenDocument(output).character(383).items[7]).toBe(62);
});

it("rejects invalid numbers, choice IDs, keys and read-only writes atomically", () => {
  const document = new EiketsudenDocument(eiketsudenFixture());
  const original = document.copy();
  for (const [key, value] of [
    ["campaign.0.money", 10_001],
    ["campaign.0.money", -1],
    ["characters.0.level", 0],
    ["characters.0.level", 100],
    ["characters.0.level", 1.5],
    ["characters.0.level", Number.NaN],
    ["characters.0.experience", 100],
    ["characters.0.troopClass", 19],
    ["characters.0.item0", 63],
    ["characters.0.item0", 254],
    ["characters.0.item8", 1],
    ["characters.384.level", 1],
    ["characters.00.level", 1],
    ["characters.0.morale", 70],
    ["characters.0.troops", 500],
    ["characters.0.strength", 99],
    ["campaign.1.money", 500],
    ["__proto__", 1],
  ] as const) {
    expect(() => editFields(document, rules, { "campaign.0.money": 9000, [key]: value })).toThrow();
    expect(document.copy()).toEqual(original);
  }
});

it("retains unknown item IDs and permits explicit replacement or duplicate items", () => {
  const bytes = eiketsudenFixture();
  bytes[1685 + 10] = 200;
  const document = new EiketsudenDocument(bytes);
  expect(findField(document, rules, "characters.0.item0").value).toBe(200);
  const unrelated = editFields(document, rules, { "campaign.0.money": 1 });
  expect(unrelated.output[1685 + 10]).toBe(200);
  const replaced = editFields(document, rules, {
    "characters.0.item0": 7,
    "characters.0.item1": 7,
  });
  expect(new EiketsudenDocument(replaced.output).character(0).items.slice(0, 2)).toEqual([7, 7]);
  expect(editFields(document, rules, {}).edits).toEqual([]);
  expect(editFields(document, rules, { "campaign.0.money": 500 }).edits).toEqual([]);
});

it("shows original game labels and keeps computed or immutable abilities read-only", () => {
  const fields = characterFields(new EiketsudenDocument(eiketsudenFixture()), 1, rules);
  expect(fields.find((field) => field.columnId === "item0")?.choices?.[2]?.label).toBe("Item 1");
  expect(fields.filter((field) => field.readonly).map((field) => field.columnId)).toEqual([
    "troops",
    "leadership",
    "strength",
    "intelligence",
  ]);
  expect(fields.some((field) => field.columnId === "morale")).toBe(false);
});
