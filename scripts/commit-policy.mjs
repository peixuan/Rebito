import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { approvedLicenseLines } from "./license-text.mjs";

const subjectPattern =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-]+\))?!?: \S.*$/;
const generatedLockfile = "platform/package-lock.json";
// biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control bytes in repository paths.
const forbiddenControl = /[\x00-\x1f]/;
const forbiddenDirectory =
  /(^|\/)(\.analysis|\.data|\.deps|\.venv|\.runtime-cache|node_modules|build|dist|coverage|playwright-report|test-results|__pycache__)(\/|$)/;
const forbiddenExtension =
  /\.(exe|dll|so|dylib|wasm|jsdos|data|rom|nes|sfc|smc|gb|gbc|gba|smd|sms|gg|bin|iso|cue|chd|img|vhdx?|qcow2|sav|srm|dat|state|db|sqlite3?|dump|zip|7z|rar|tar|tgz|gz|pyc|log|pem|p12|pfx|key)$/i;

export function validateMessage(message) {
  const subject = message.trimEnd();
  if (subject.includes("\n") || subject.includes("\r")) {
    throw new Error("Commit message must contain exactly one subject line.");
  }
  if (subject.length > 72 || !subjectPattern.test(subject)) {
    throw new Error("Use a Conventional Commits subject of at most 72 characters.");
  }
}

export function validateChanges(entries, paths, licenseContents = new Map()) {
  for (const path of paths) {
    const name = path.split("/").at(-1);
    if (
      forbiddenControl.test(path) ||
      forbiddenDirectory.test(path) ||
      forbiddenExtension.test(path) ||
      (name.startsWith(".env") && name !== ".env.example")
    ) {
      throw new Error(`Forbidden artifact or private configuration: ${path}`);
    }
  }

  let handwritten = 0;
  let generated = 0;
  let licenseText = 0;
  for (const entry of entries) {
    const { added, deleted, path } = entry;
    if (
      !Number.isSafeInteger(added) ||
      !Number.isSafeInteger(deleted) ||
      added < 0 ||
      deleted < 0
    ) {
      throw new Error(`Binary or invalid change statistics: ${path}`);
    }
    const content = licenseContents.get(path);
    const allowance = content ? approvedLicenseLines(entry, content.before, content.after) : 0;
    licenseText += allowance;
    if (path === generatedLockfile) generated += added + deleted;
    else handwritten += added + deleted - allowance;
  }
  if (handwritten > 500) throw new Error(`Handwritten changes exceed 500 lines: ${handwritten}`);
  if (handwritten + generated > 500 && entries.length !== 1)
    throw new Error("Changes exceed 500 lines; an oversized lockfile needs a dedicated commit.");
  if (licenseText && entries.length !== 1)
    throw new Error("Approved legal text must be introduced in a dedicated commit.");
  return { handwritten, generated, ...(licenseText ? { licenseText } : {}) };
}

function git(args, input) {
  return execFileSync("git", args, { input, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

function entriesFrom(output) {
  return output
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, ...path] = line.split("\t");
      return { added: Number(added), deleted: Number(deleted), path: path.join("\t") };
    });
}

function inspect(diffArguments) {
  const entries = entriesFrom(git(["diff", ...diffArguments, "--no-renames", "--numstat", "-z"]));
  if (!entries.length) throw new Error("Empty changes are not independently reviewable commits.");
  const paths = git(["diff", ...diffArguments, "--name-only", "--diff-filter=ACMR", "-z"])
    .split("\0")
    .filter(Boolean);
  const licenseContents = new Map();
  const staged = diffArguments[0] === "--cached";
  const previous = staged ? "HEAD" : diffArguments[0];
  const target = staged ? "" : diffArguments.at(-1);
  for (const entry of entries) {
    if (!["LICENSE", "platform/LICENSE"].includes(entry.path) || ![661, 671].includes(entry.added))
      continue;
    const exists = git(["ls-tree", previous, "--", entry.path]).trim();
    licenseContents.set(entry.path, {
      before: exists ? git(["show", `${previous}:${entry.path}`]) : "",
      after: git(["show", `${target}:${entry.path}`]),
    });
  }
  const totals = validateChanges(entries, paths, licenseContents);
  git(["diff", ...diffArguments, "--check"]);
  return totals;
}

function inspectHistory(revision) {
  const commits = git(["rev-list", "--reverse", revision]).trim().split("\n").filter(Boolean);
  const emptyTree = git(["hash-object", "-t", "tree", "--stdin"], "").trim();
  for (const commit of commits) {
    validateMessage(git(["show", "-s", "--format=%B", commit]));
    const [, parent] = git(["rev-list", "--parents", "-n", "1", commit]).trim().split(" ");
    console.log(commit.slice(0, 8), inspect([parent ?? emptyTree, commit]));
  }
}

function main(args) {
  if (args[0] === "--message" && args.length === 2) {
    validateMessage(readFileSync(args[1], "utf8"));
  } else if (args[0] === "--staged" && args.length === 1) {
    console.log("Staged change budget:", inspect(["--cached"]));
  } else if (args[0] === "--history" && args.length === 1) {
    inspectHistory("HEAD");
  } else if (args[0] === "--range" && args.length === 2) {
    // Accept only object IDs, never arbitrary revisions/options supplied by CI input.
    if (!/^[a-f0-9]{7,40}\.\.[a-f0-9]{7,40}$/i.test(args[1])) {
      throw new Error("Expected a range of two hexadecimal commit IDs.");
    }
    inspectHistory(args[1]);
  } else {
    throw new Error(
      "Usage: commit-policy.mjs --staged | --message FILE | --history | --range BASE..HEAD",
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
