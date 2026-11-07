import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { officialLicenseSha256 } from "./license-text.mjs";

test("keeps the Docker context license identical to the source license", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const license = read("LICENSE").replaceAll("\r\n", "\n");
  assert.equal(read("platform/LICENSE").replaceAll("\r\n", "\n"), license);
  assert.equal(createHash("sha256").update(license).digest("hex"), officialLicenseSha256);
  const notice = read("NOTICE").replaceAll("\r\n", "\n");
  assert.equal(read("platform/NOTICE").replaceAll("\r\n", "\n"), notice);
  assert.match(notice, /Copyright \(c\) 2026 Rebito contributors/);
  assert.match(notice, /SPDX-License-Identifier: AGPL-3\.0-or-later/);
  assert.match(notice, /option\) any later version/);
  assert.equal(JSON.parse(read("platform/package.json")).license, "AGPL-3.0-or-later");
  assert.equal(
    JSON.parse(read("platform/package-lock.json")).packages[""].license,
    "AGPL-3.0-or-later",
  );
});
