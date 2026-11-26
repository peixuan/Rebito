import { expect, it } from "vitest";
import { nesPresetCode, nesPresetsFor } from "../../src/editors/nes/presets.ts";

it("binds a preset to full release bytes independently of the title or runtime RAM", () => {
  const hash = "7a60fedbef65e6dec681525c17681e1e940f55534ff62e765d0ec15842eab422";
  const [health] = nesPresetsFor(hash);
  if (!health) throw new Error("Missing verified release");
  expect(nesPresetCode(health, 16)).toBe("0045:10");
  expect(nesPresetCode(health, 64)).toBe("0045:40");
  expect(() => nesPresetCode(health, 65)).toThrow();
  expect(() => nesPresetCode(health, 1.5)).toThrow();
  for (const other of [hash.slice(1), `${hash.slice(0, -1)}3`, "Castlevania", "constructor"])
    expect(nesPresetsFor(other)).toEqual([]);
});

it("rejects unverified intermediate bytes in a choice-based setting", () => {
  const [hearts] = nesPresetsFor(
    "b903a9706220881b94b4d24d8fa64620332a870c1590cb827cef8e71ee05e21d",
  );
  if (!hearts) throw new Error("Missing translated cartridge");
  expect(nesPresetCode(hearts, 24)).toBe("0210:18");
  expect(nesPresetCode(hearts, 8)).toBe("0210:08");
  expect(() => nesPresetCode(hearts, 9)).toThrow();
});

it("shares verified layouts only between independently tested editions", () => {
  const first = "02ade1c348b1c7db2b28882c4fba27da69966f5063d8e0f374f909f8dd202749";
  const second = "b0c5a8521dfece66be202b6a7b70016d432e8bf2b5986d672c9bdc4bfab94135";
  expect(nesPresetsFor(first)).toHaveLength(1);
  expect(nesPresetsFor(first)).toEqual(nesPresetsFor(second));
  expect(nesPresetsFor("11e7d2ba809ee9796778887ee59851f6aaef3371db764b2d9c6a3b4aac17a22d")).toEqual(
    [],
  );
});
