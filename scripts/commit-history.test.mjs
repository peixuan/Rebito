import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
    const commit = (subject, content) => {
      writeFileSync(join(directory, "README.md"), content);
      git("add", "README.md");
      git("commit", "--quiet", "-m", subject);
      return git("rev-parse", "HEAD");
    };
    const check = (...args) =>
      spawnSync(process.execPath, [policy, ...args], {
        cwd: directory,
        encoding: "utf8",
      });
    action({ commit, check, git });
  } finally {
    // Only the dedicated, absolute mkdtemp directory is removed.
    rmSync(directory, { recursive: true, force: true });
  }
}

test("checks root and descendants without a hard-coded historical baseline", () => {
  repository(({ commit, check }) => {
    const first = commit("docs: establish project scope", "Scope\n");
    const last = commit("docs: explain development", "Scope\nDevelopment\n");
    const history = check("--history");
    assert.equal(history.status, 0, history.stderr);
    assert.equal(history.stdout.trim().split("\n").length, 2);
    const range = check("--range", `${first}..${last}`);
    assert.equal(range.status, 0, range.stderr);
    assert.equal(range.stdout.trim().split("\n").length, 1);
    assert.notEqual(check("--range", "--all").status, 0);
  });
});

test("rejects empty commits instead of treating them as completed work", () => {
  repository(({ commit, check, git }) => {
    commit("docs: establish project scope", "Scope\n");
    git("commit", "--quiet", "--allow-empty", "-m", "ci: trigger another run");
    assert.match(check("--history").stderr, /Empty changes/);
  });
});

test("does not exempt a root commit from message or size checks", () => {
  repository(({ commit, check }) => {
    commit("Initial commit", "Scope\n");
    assert.match(check("--history").stderr, /Conventional Commits/);
  });
  repository(({ commit, check }) => {
    commit("docs: establish project scope", "line\n".repeat(501));
    assert.match(check("--history").stderr, /exceed 500 lines/);
  });
});
