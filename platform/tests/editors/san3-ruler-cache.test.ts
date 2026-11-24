import { describe, expect, it } from "vitest";
import { San3Document } from "../../src/editors/san3/document.ts";
import { succeedSan3RulerAcrossCities } from "../../src/editors/san3/governance-succession.ts";
import { replaceSan3Ruler } from "../../src/editors/san3/ruler-change.ts";
import { governanceCity, san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 active ruler cache", () => {
  for (const [name, transition, successor] of [
    ["same-city", replaceSan3Ruler, 1],
    ["cross-city", succeedSan3RulerAcrossCities, 4],
  ] as const) {
    it(`updates ${name} succession without changing control, city or faction caches`, () => {
      const bytes = san3GovernanceFixture();
      bytes[governanceCity(0) + 23] = 0xa4;
      const document = new San3Document(bytes);
      const data = new DataView(bytes.buffer);
      data.setUint32(0x7dc22, document.offset("factions", 0));
      data.setUint16(0x7dc26, 0);
      data.setUint32(0x7dc2a, governanceCity(0));
      bytes[0x7dc0a] = 1;
      const before = bytes.slice();
      const result = transition(new San3Document(bytes), 0, successor);
      const changed = new DataView(result.bytes.buffer);
      expect(changed.getUint16(0x7dc26)).toBe(successor);
      expect(changed.getUint32(0x7dc22)).toBe(data.getUint32(0x7dc22));
      expect(changed.getUint32(0x7dc2a)).toBe(governanceCity(0));
      expect(result.bytes.slice(0x7dc0a, 0x7dc1f)).toEqual(bytes.slice(0x7dc0a, 0x7dc1f));
      expect(bytes).toEqual(before);
      data.setUint16(0x7dc26, 7);
      expect(() => transition(new San3Document(bytes), 0, successor)).toThrow();
      data.setUint32(0x7dc22, document.offset("factions", 1));
      const foreign = transition(new San3Document(bytes), 0, successor);
      expect(new DataView(foreign.bytes.buffer).getUint16(0x7dc26)).toBe(7);
    });
  }
});
