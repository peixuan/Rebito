import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { originalLicense } from "./fixtures/original-license.mjs";

const policy = fileURLToPath(new URL("./commit-policy.mjs", import.meta.url));

function repository(action) {
  const directory = mkdtempSync(join(tmpdir(), "retro-commit-policy-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  try {
    git("init", "--quiet");
    git("config", "user.name", "Policy Test");
    git("config", "user.email", "policy@example.test");
    git("config", "core.autocrlf", "false");
    git("config", "core.hooksPath", "/dev/null");
    git("config", "commit.gpgsign", "false");
    // Synthetic dates exercise policy boundaries in disposable fixture repos;
    // they are never used for project commits.
    let timestamp = 1_000_000_000;
    const record = (subject, author, committer) => {
      if (author === undefined) {
        timestamp += 10;
        author = timestamp;
      }
      if (committer === undefined) committer = author;
      execFileSync("git", ["commit", "--quiet", "--allow-empty", "-m", subject], {
        cwd: directory,
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: `${author} +0000`,
          GIT_COMMITTER_DATE: `${committer} +0000`,
        },
      });
      return git("rev-parse", "HEAD");
    };
    const commit = (subject, content) => {
      writeFileSync(join(directory, "README.md"), content);
      git("add", "README.md");
      return record(subject);
    };
    const check = (...args) =>
      spawnSync(process.execPath, [policy, ...args], {
        cwd: directory,
        encoding: "utf8",
      });
    action({ commit, check, git, record, directory });
  } finally {
    // Only the dedicated, absolute mkdtemp directory is removed.
    rmSync(directory, { recursive: true, force: true });
  }
}

test("requires the retained publication baseline and accepts an explicit test range", () => {
  repository(({ commit, check }) => {
    const first = commit("docs: establish project scope", "Scope\n");
    const last = commit("docs: explain development", "Scope\nDevelopment\n");
    const history = check("--history");
    assert.notEqual(history.status, 0);
    assert.match(history.stderr, /must descend from/);
    const range = check("--range", `${first}..${last}`);
    assert.equal(range.status, 0, range.stderr);
    assert.equal(range.stdout.trim().split("\n").length, 1);
    assert.notEqual(check("--range", "--all").status, 0);
  });
});

test("rejects empty commits instead of treating them as completed work", () => {
  repository(({ commit, check, record }) => {
    const base = commit("docs: establish project scope", "Scope\n");
    const tip = record("ci: trigger another run");
    assert.match(check("--range", `${base}..${tip}`).stderr, /Empty changes/);
  });
});

test("enforces message and size checks after the specified base", () => {
  repository(({ commit, check }) => {
    const base = commit("Template history", "Scope\n");
    const tip = commit("Update files", "Changed\n");
    assert.match(check("--range", `${base}..${tip}`).stderr, /Conventional Commits/);
  });
  repository(({ commit, check }) => {
    const base = commit("Template history", "Scope\n");
    const tip = commit("docs: establish project scope", "line\n".repeat(501));
    assert.match(check("--range", `${base}..${tip}`).stderr, /exceed 500 lines/);
  });
});

test("counts only actual rename edits but charges full copies and guards new paths", () => {
  repository(({ commit, check, git, record, directory }) => {
    const base = commit("Template history", "original\n".repeat(600));
    git("config", "diff.renames", "copies");
    renameSync(join(directory, "README.md"), join(directory, "guide.md"));
    git("add", "--", "README.md", "guide.md");
    const moved = record("docs: move the contributor guide");
    const renameCheck = check("--range", `${base}..${moved}`);
    assert.equal(renameCheck.status, 0, renameCheck.stderr);
    assert.match(renameCheck.stdout, /handwritten: 0/);
    writeFileSync(join(directory, "guide.md"), `edited\n${"original\n".repeat(599)}`);
    renameSync(join(directory, "guide.md"), join(directory, "instructions.md"));
    git("add", "--", "guide.md", "instructions.md");
    const edited = record("docs: clarify and rename instructions");
    assert.match(check("--range", `${moved}..${edited}`).stdout, /handwritten: 2/);
    copyFileSync(join(directory, "instructions.md"), join(directory, "copy.md"));
    git("add", "--", "copy.md");
    const copied = record("docs: copy instructions");
    assert.match(check("--range", `${edited}..${copied}`).stderr, /exceed 500/);
    renameSync(join(directory, "copy.md"), join(directory, "game.exe"));
    git("add", "--", "copy.md", "game.exe");
    const forbidden = record("test: rename fixture to an executable");
    assert.match(check("--range", `${copied}..${forbidden}`).stderr, /Forbidden artifact/);
  });
});

test("checks parent metadata even when the parent is excluded from a range", () => {
  repository(({ commit, check, git, record, directory }) => {
    const base = commit("docs: define scope", "Scope\n");
    writeFileSync(join(directory, "README.md"), "Changed\n");
    git("add", "--", "README.md");
    const tip = record("docs: revise scope", 1_000_000_011);
    assert.match(check("--range", `${base}..${tip}`).stderr, /authorTime must advance/);
  });
});

for (const [name, license, authored] of [
  ["canonical", readFileSync(new URL("../LICENSE", import.meta.url), "utf8"), 0],
  ["original prefixed", originalLicense, 10],
])
  test(`validates ${name} license Git blobs, including the staged index`, () => {
    repository(({ commit, check, git, record, directory }) => {
      const base = commit("docs: define scope", "Scope\n");
      const target = join(directory, "LICENSE");
      writeFileSync(target, license);
      git("add", "--", "LICENSE");
      writeFileSync(target, "unstaged replacement\n");
      const staged = check("--staged");
      assert.equal(staged.status, 0, staged.stderr);
      assert.ok(staged.stdout.includes(`handwritten: ${authored}, generated: 0, licenseText: 661`));
      const tip = record("docs: adopt the complete AGPL grant");
      const history = check("--range", `${base}..${tip}`);
      assert.equal(history.status, 0, history.stderr);
      writeFileSync(target, license);
      writeFileSync(join(directory, "COPYING"), license);
      git("add", "--", "COPYING");
      assert.match(check("--staged").stderr, /exceed 500/);
    });
  });
