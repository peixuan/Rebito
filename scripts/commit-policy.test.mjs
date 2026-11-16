import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateChanges, validateMessage } from "./commit-policy.mjs";
import { originalLicense } from "./fixtures/original-license.mjs";

test("accepts a concise Conventional Commits subject", () => {
  for (const message of [
    "feat(saves): preserve history",
    "fix!: reject old snapshots\n",
    "docs: update α-version guidance",
  ]) {
    assert.doesNotThrow(() => validateMessage(message));
  }
});

test("rejects bodies, empty descriptions, unknown types and long subjects", () => {
  for (const message of [
    "fix: change\n\nbody",
    "Update files",
    "feat: ",
    "oops: fix",
    `fix: ${"x".repeat(68)}`,
  ]) {
    assert.throws(() => validateMessage(message));
  }
});

test("counts additions and deletions together", () => {
  assert.deepEqual(
    validateChanges([{ added: 300, deleted: 200, path: "src/a.ts" }], ["src/a.ts"]),
    { handwritten: 500, generated: 0 },
  );
  assert.throws(() =>
    validateChanges([{ added: 300, deleted: 201, path: "src/a.ts" }], ["src/a.ts"]),
  );
});

test("exempts only the approved initial legal text and counts the authored grant", () => {
  const license = originalLicense;
  for (const path of ["LICENSE", "platform/LICENSE"]) {
    const entry = { path, added: 671, deleted: 0 };
    const contents = new Map([[path, { before: "", after: license }]]);
    assert.deepEqual(validateChanges([entry], [path], contents), {
      handwritten: 10,
      generated: 0,
      licenseText: 661,
    });
    assert.throws(() => validateChanges([entry], [path]), /exceed 500/);
    for (const value of [
      { before: "previous grant", after: license },
      { before: "", after: license.replace("GNU AFFERO", "GNU MODIFIED") },
      { before: "", after: `${license}extra text\n` },
      { before: "", after: undefined },
    ])
      assert.throws(() => validateChanges([entry], [path], new Map([[path, value]])), /exceed 500/);
    for (const changed of [
      { ...entry, deleted: 1 },
      { ...entry, added: 672 },
    ]) {
      assert.throws(() => validateChanges([changed], [path], contents), /exceed 500/);
    }
    assert.throws(
      () =>
        validateChanges(
          [entry, { path: "code.ts", added: 491, deleted: 0 }],
          [path, "code.ts"],
          contents,
        ),
      /exceed 500/,
    );
  }
  assert.throws(
    () =>
      validateChanges(
        [{ path: "extra/LICENSE", added: 671, deleted: 0 }],
        ["extra/LICENSE"],
        new Map([["extra/LICENSE", { before: "", after: license }]]),
      ),
    /exceed 500/,
  );
});

test("requires dedicated commits for oversized package locks", () => {
  const lock = { added: 600, deleted: 0, path: "platform/package-lock.json" };
  assert.deepEqual(validateChanges([lock], [lock.path]), { handwritten: 0, generated: 600 });
  for (const change of [
    { path: "README.md", added: 1, deleted: 0 },
    { path: "old.ts", added: 0, deleted: 1 },
    { path: "moved.ts", added: 0, deleted: 0 },
  ])
    assert.throws(
      () => validateChanges([lock, change], [lock.path, change.path]),
      /dedicated commit/,
    );
  const small = { ...lock, added: 300 };
  const code = { path: "src/a.ts", added: 200, deleted: 0 };
  assert.doesNotThrow(() => validateChanges([small, code], [small.path, code.path]));
  assert.throws(() => validateChanges([small, { ...code, added: 201 }], [small.path, code.path]));
  for (const path of ["web/package-lock.json", "pnpm-lock.yaml", "yarn.lock"])
    assert.throws(() => validateChanges([{ ...lock, path }], [path]), /exceed 500/);
});

test("exempts canonical AGPL text only at its approved initial locations", () => {
  const license = readFileSync(new URL("../LICENSE", import.meta.url), "utf8");
  for (const path of ["LICENSE", "platform/LICENSE"]) {
    const entry = { path, added: 661, deleted: 0 };
    const contents = new Map([[path, { before: "", after: license }]]);
    assert.deepEqual(validateChanges([entry], [path], contents), {
      handwritten: 0,
      generated: 0,
      licenseText: 661,
    });
    for (const value of [
      { before: license, after: license },
      { before: "", after: license.replace("GNU AFFERO", "GNU MODIFIED") },
      { before: "", after: `${license}extra text\n` },
    ])
      assert.throws(() => validateChanges([entry], [path], new Map([[path, value]])), /exceed 500/);
    assert.throws(() => validateChanges([{ ...entry, deleted: 1 }], [path], contents));
  }
  const path = "extra/LICENSE";
  assert.throws(() =>
    validateChanges(
      [{ path, added: 661, deleted: 0 }],
      [path],
      new Map([[path, { before: "", after: license }]]),
    ),
  );
});

test("rejects game artifacts, outputs and secret files at any depth", () => {
  for (const path of [
    ".analysis/evidence.json",
    "web/node_modules/a.js",
    "games/GAME.GBA",
    "saves/KOUKAI2.DAT",
    ".env",
    "web/.env.production",
    "a/coverage/data.json",
    "bad\nname.ts",
  ]) {
    assert.throws(() => validateChanges([], [path]), path);
  }
  assert.doesNotThrow(() =>
    validateChanges([], [".env.example", "src/editor.ts", "docs/FORMAT.md"]),
  );
});

test("rejects disc images, firmware, database copies and private keys", () => {
  for (const path of [
    "BIOS.bin",
    "disc.ISO",
    "disc.cue",
    "disc.chd",
    "machine.img",
    "machine.vhdx",
    "machine.qcow2",
    "game.smd",
    "game.sms",
    "game.gg",
    "backup.dump",
    "data.db",
    "data.sqlite3",
    "dependencies.tgz",
    "source.tar.gz",
    "server.key",
    "id.pem",
    ".data/catalog.json",
    "plugin.so",
    "plugin.dylib",
    "game.jsdos",
    "core-wasm.data",
  ]) {
    assert.throws(() => validateChanges([], [path]), path);
  }
  assert.doesNotThrow(() => validateChanges([], ["platform/tests/library/segacd-fixtures.ts"]));
});

test("rejects binary or malformed statistics instead of excluding them", () => {
  for (const added of [NaN, Infinity, -1, 1.5]) {
    assert.throws(() => validateChanges([{ added, deleted: 0, path: "file" }], ["file"]));
  }
});

test("rejects unrelated changes alongside an approved license exception", () => {
  const entry = { path: "LICENSE", added: 671, deleted: 0 };
  const contents = new Map([["LICENSE", { before: "", after: originalLicense }]]);
  for (const changed of [
    { path: "README.md", added: 1, deleted: 0 },
    { path: "old.ts", added: 0, deleted: 1 },
    { path: "moved.ts", added: 0, deleted: 0 },
  ]) {
    assert.throws(
      () => validateChanges([entry, changed], [entry.path, changed.path], contents),
      /dedicated commit/,
    );
  }
});
