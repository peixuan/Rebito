import assert from "node:assert/strict";
import test from "node:test";
import { parseNumstat, validateTimeline } from "./commit-timeline.mjs";

const previous = { authorTime: 100, committerTime: 200, subject: "docs: explain scope" };
const current = {
  id: "test",
  authorTime: 103,
  committerTime: 203,
  subject: "docs: explain setup",
  authorName: "Contributor",
  authorEmail: "author@example.test",
  committerName: "Maintainer",
  committerEmail: "maintainer@example.test",
};

test("accepts distinct real author and committer identities and the minimum interval", () => {
  assert.doesNotThrow(() => validateTimeline(current, previous));
});

test("rejects simultaneous, reversed and too-close author or committer times", () => {
  for (const field of ["authorTime", "committerTime"]) {
    for (const delta of [-1, 0, 1, 2]) {
      assert.throws(() =>
        validateTimeline({ ...current, [field]: previous[field] + delta }, previous),
      );
    }
    for (const value of [NaN, -1, 1.5]) {
      assert.throws(() => validateTimeline({ ...current, [field]: value }, previous));
    }
  }
  assert.throws(() => validateTimeline({ ...current, authorTime: 204 }, previous), /Author time/);
});

test("rejects adjacent repeated subjects and missing identity", () => {
  assert.throws(
    () => validateTimeline({ ...current, subject: previous.subject }, previous),
    /Adjacent/,
  );
  for (const role of ["author", "committer"]) {
    assert.throws(() => validateTimeline({ ...current, [`${role}Name`]: "" }, previous));
    assert.throws(() => validateTimeline({ ...current, [`${role}Email`]: "missing" }, previous));
  }
});

test("parses normal paths, rename destinations and binary markers without copy detection", () => {
  assert.deepEqual(parseNumstat("2\t1\tsrc/a.ts\0" + "0\t0\t\0old\tname\0new name\0"), [
    { added: 2, deleted: 1, path: "src/a.ts" },
    { added: 0, deleted: 0, path: "new name" },
  ]);
  assert.ok(Number.isNaN(parseNumstat("-\t-\tasset\0")[0].added));
  for (const value of ["bad\0", "1\t2\tfile", "0\t0\t\0old\0"]) {
    assert.throws(() => parseNumstat(value));
  }
});
