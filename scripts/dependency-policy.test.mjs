import assert from "node:assert/strict";
import test from "node:test";
import { checkDependencies } from "./dependency-policy.mjs";

const lock = (packages) => ({ lockfileVersion: 3, packages: { "": {}, ...packages } });

test("reviews transitive and optional packages, excluding only the project root", () => {
  assert.equal(
    checkDependencies(
      lock({
        "node_modules/ui": { license: "MIT" },
        "node_modules/tool/native": { license: "MPL-2.0", optional: true },
        "node_modules/compiler": { license: "MIT OR Apache-2.0", dev: true },
      }),
    ),
    3,
  );
});

test("requires review for missing, proprietary and new SPDX expressions", () => {
  for (const license of [undefined, "SEE LICENSE IN LICENSE.md", "UNLICENSED", "MIT AND Custom"]) {
    assert.throws(
      () => checkDependencies(lock({ "node_modules/example": { license } })),
      /node_modules\/example: unreviewed license/,
    );
  }
});

test("reports every unknown license rather than stopping at the first dependency", () => {
  assert.throws(
    () =>
      checkDependencies(
        lock({
          "node_modules/first": {},
          "node_modules/second": {},
        }),
      ),
    /first:.*\nnode_modules\/second:/,
  );
});

test("does not accept an absent or incompatible lockfile structure", () => {
  for (const value of [{}, { lockfileVersion: 3 }, { lockfileVersion: 3, packages: {} }]) {
    assert.throws(() => checkDependencies(value), /npm v3 lockfile/);
  }
});
