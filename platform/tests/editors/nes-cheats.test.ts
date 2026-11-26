import { describe, expect, it, vi } from "vitest";
import { createNesCheats } from "../../client/nes-cheats/runtime.ts";
import { normalizeNesCode } from "../../src/editors/nes/codes.ts";
import { nesRamSize, readNesRam } from "../../src/editors/nes/ram.ts";

function word(value: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

const ram = Buffer.alloc(nesRamSize, 17);
function record(name: string, bytes: Buffer) {
  return Buffer.concat([Buffer.from(name), word(bytes.length), bytes]);
}
function cpu(...records: Buffer[]) {
  const data = Buffer.concat(records);
  return Buffer.concat([Buffer.of(1), word(data.length), data]);
}
function state(...chunks: Buffer[]) {
  const body = Buffer.concat(chunks);
  const memory = Buffer.concat([
    Buffer.of(0x46, 0x43, 0x53, 0xff),
    word(body.length),
    word(9813),
    word(0),
    body,
  ]);
  return Buffer.concat([
    Buffer.from("RASTATE\x01"),
    record("MEM ", memory),
    Buffer.alloc((8 - (memory.length % 8)) % 8),
    record("END ", Buffer.alloc(0)),
  ]);
}

describe("FCEUmm RAM", () => {
  const data = record("RAM\0", ram);
  it("copies CPU RAM, skips other fields and respects the input view", () => {
    const snapshot = state(cpu(record("PC\0\0", Buffer.of(0, 128)), data));
    const slice = Buffer.concat([Buffer.of(7), snapshot]).subarray(1);
    const read = readNesRam(slice);
    expect(read).toEqual(new Uint8Array(ram));
    read.fill(0);
    expect(slice.equals(snapshot)).toBe(true);
  });

  it.each([
    state(),
    state(cpu()),
    state(cpu(data, data)),
    state(cpu(data), cpu(data)),
    state(cpu(record("RAM\0", Buffer.alloc(12)))),
    state(cpu(data.subarray(0, -1))),
    state(cpu(Buffer.alloc(7))),
    state(Buffer.of(1)),
    state(cpu(data)).subarray(0, -1),
  ])("rejects missing, truncated or ambiguous records", (snapshot) => {
    expect(() => readNesRam(snapshot)).toThrow();
  });

  it("rejects unsupported core formats and lengths", () => {
    for (const offset of [16, 20, 24, 33]) {
      const snapshot = state(cpu(data));
      snapshot[offset] = 0xff;
      expect(() => readNesRam(snapshot)).toThrow();
    }
  });
});

describe("NES codes", () => {
  it.each(["sxioPo", " GZUXNGEI ", "00fe:53", "0600?03:09", "8000:FF"])("normalizes %s", (code) =>
    expect(normalizeNesCode(code)).toBe(code.trim().toUpperCase()),
  );
  it.each([
    "",
    "AAAAAA+AAAAAA",
    "0000?03:FF",
    "2000:00",
    "0800:FF",
    "ABCFGH",
    "0600:300",
    "1234:56\nF000:FF",
    "a".repeat(34),
  ])("rejects %s", (code) => expect(normalizeNesCode(code)).toBeNull());

  it("replaces one runtime's complete code list only after validating it", () => {
    const core = { getState: vi.fn(), resetCheat: vi.fn(), setCheat: vi.fn() };
    const port = createNesCheats(core, "test-rom");
    port.setCodes(["00FE:01", "00fe:01", "AAAAAA"]);
    expect(core.setCheat.mock.calls).toEqual([
      [0, true, "00FE:01"],
      [1, true, "AAAAAA"],
    ]);
    for (const codes of [["00FE:02", "bad"], Array(33).fill("AAAAAA")])
      expect(() => port.setCodes(codes)).toThrow();
    expect(core.resetCheat).toHaveBeenCalledTimes(1);
    port.setCodes([]);
    expect(core.resetCheat).toHaveBeenCalledTimes(2);
    expect(core.setCheat).toHaveBeenCalledTimes(2);
  });
});
