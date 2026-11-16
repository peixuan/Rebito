import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { createApp } from "../src/server/app.ts";
import { registerWeb } from "../src/server/web.ts";
import { archiveSetDigest, installMaterials, validateMaterials } from "./runtime-materials.mjs";

const bytes = Buffer.from("Original upstream license\r\n");
const hash = createHash("sha256").update(bytes).digest("hex");
const lock = { packages: [{ id: "core", integrity: "sha512-test" }] };
const fixture = () => ({
  version: 1,
  archiveSetSha256: archiveSetDigest(lock),
  components: [
    {
      id: "core",
      repository: "upstream/core",
      revision: "a".repeat(40),
      evidence: "embedded-revision",
      materials: [{ path: "LICENSE", sha256: hash }],
    },
  ],
});

async function temporary(action) {
  const directory = await mkdtemp(join(tmpdir(), "retro-runtime-materials-"));
  try {
    await action(directory, join(directory, "output"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test("copies exact upstream bytes and builds offline from a verified cache", async () => {
  await temporary(async (cache, output) => {
    let calls = 0;
    const download = async (url, options) => {
      calls++;
      assert.equal(
        url,
        `https://raw.githubusercontent.com/upstream/core/${"a".repeat(40)}/LICENSE`,
      );
      assert.equal(options.redirect, "error");
      return new Response(bytes);
    };
    await installMaterials(fixture(), lock, cache, output, download);
    assert.deepEqual(await readFile(join(output, `${hash}.txt`)), bytes);
    assert.deepEqual(JSON.parse(await readFile(join(output, "inventory.json"))), fixture());
    assert.match(
      await readFile(join(output, "README.txt"), "utf8"),
      /not complete corresponding source/,
    );
    await installMaterials(fixture(), lock, cache, output, download);
    assert.equal(calls, 1);
    assert.ok(!(await readdir(cache)).some((path) => path.endsWith(".tmp")));
  });
});

test("rejects a changed runtime lock even when package names are unchanged", () => {
  assert.throws(
    () => validateMaterials(fixture(), { packages: [{ id: "core", integrity: "changed" }] }),
    /locked archives/,
  );
  const two = { packages: [...lock.packages, { id: "another", integrity: "other" }] };
  assert.equal(archiveSetDigest(two), archiveSetDigest({ packages: [...two.packages].reverse() }));
});

test("uses only the official pinned contents API after a raw-domain network failure", async () => {
  await temporary(async (cache, output) => {
    const urls = [];
    const manifest = fixture();
    const extra = Buffer.from("build recipe\n");
    manifest.components[0].materials.push({
      path: "Makefile",
      sha256: createHash("sha256").update(extra).digest("hex"),
    });
    await installMaterials(manifest, lock, cache, output, async (url, options) => {
      urls.push(url);
      if (urls.length === 1) throw new TypeError("fetch failed");
      assert.equal(options.headers.Accept, "application/vnd.github.raw+json");
      return new Response(url.includes("Makefile") ? extra : bytes);
    });
    assert.equal(urls.length, 3);
    assert.equal(new URL(urls[2]).hostname, "api.github.com");
    assert.equal(
      urls[1],
      `https://api.github.com/repos/upstream/core/contents/LICENSE?ref=${"a".repeat(40)}`,
    );
    assert.deepEqual(await readFile(join(output, `${hash}.txt`)), bytes);
  });
});

test("serves hidden-path materials as plain text without weakening dotfile protection", async () => {
  await temporary(async (cache, output) => {
    const manifest = fixture();
    manifest.components[0].materials[0].path = ".github/workflows/build.yml";
    await installMaterials(manifest, lock, cache, output, async () => new Response(bytes));
    const app = createApp({ write() {} });
    try {
      registerWeb(app, output);
      const response = await app.inject(`/${hash}.txt`);
      assert.equal(response.statusCode, 200);
      assert.match(response.headers["content-type"], /^text\/plain/);
      assert.deepEqual(response.rawPayload, bytes);
      assert.equal((await app.inject("/.github/workflows/build.yml")).statusCode, 403);
    } finally {
      await app.close();
    }
  });
});

test("rejects mutable sources, unsafe paths, unsupported evidence and duplicate inputs", () => {
  for (const change of [
    (entry) => {
      entry.revision = "main";
    },
    (entry) => {
      entry.repository = "https://untrusted.test/core";
    },
    (entry) => {
      entry.id = "../outside";
    },
    (entry) => {
      entry.evidence = "verified-clean-build";
    },
    (entry) => {
      entry.materials = [];
    },
    (entry) => {
      entry.materials.push({ ...entry.materials[0] });
    },
    (entry) => {
      entry.materials[0].sha256 = "unverified";
    },
  ]) {
    const manifest = fixture();
    change(manifest.components[0]);
    assert.throws(() => validateMaterials(manifest, lock));
  }
  for (const path of ["../LICENSE", "/LICENSE", "a//b", "a\\b", "a/%2e%2e/b", "a/./b"]) {
    const manifest = fixture();
    manifest.components[0].materials[0].path = path;
    assert.throws(() => validateMaterials(manifest, lock));
  }
  const duplicate = fixture();
  duplicate.components.push(duplicate.components[0]);
  assert.throws(() => validateMaterials(duplicate, lock));
});

test("rejects damaged downloads and cache entries without publishing a receipt", async () => {
  await temporary(async (cache, output) => {
    await assert.rejects(
      installMaterials(fixture(), lock, cache, output, async () => new Response("damaged")),
      /integrity mismatch/,
    );
    await assert.rejects(readFile(join(output, "inventory.json")), { code: "ENOENT" });
    await writeFile(join(cache, `${hash}.txt`), "damaged");
    await assert.rejects(
      installMaterials(fixture(), lock, cache, output, async () => {
        throw new Error("must not fetch over corrupted evidence");
      }),
      /integrity mismatch/,
    );
  });
});

test("removes an earlier completion receipt if rebuilding from a damaged cache fails", async () => {
  await temporary(async (cache, output) => {
    await installMaterials(fixture(), lock, cache, output, async () => new Response(bytes));
    await writeFile(join(cache, `${hash}.txt`), "damaged");
    await assert.rejects(installMaterials(fixture(), lock, cache, output), /integrity mismatch/);
    await assert.rejects(readFile(join(output, "inventory.json")), { code: "ENOENT" });
  });
});

test("removes obsolete generated materials while retaining unrelated files", async () => {
  await temporary(async (cache, output) => {
    await installMaterials(fixture(), lock, cache, output, async () => new Response(bytes));
    const obsolete = join(output, `${"0".repeat(64)}.txt`);
    await writeFile(obsolete, "old generated material");
    await writeFile(join(output, "operator-note.txt"), "keep");
    await installMaterials(fixture(), lock, cache, output);
    await assert.rejects(readFile(obsolete), { code: "ENOENT" });
    assert.equal(await readFile(join(output, "operator-note.txt"), "utf8"), "keep");
    assert.deepEqual(await readFile(join(output, `${hash}.txt`)), bytes);
  });
});

test("propagates HTTP and network failures and bounds streamed responses", async () => {
  await temporary(async (cache, output) => {
    await assert.rejects(
      installMaterials(
        fixture(),
        lock,
        cache,
        output,
        async () => new Response("missing", { status: 404 }),
      ),
      /download failed: 404/,
    );
    await assert.rejects(
      installMaterials(fixture(), lock, cache, output, async () => {
        throw new Error("offline");
      }),
      /offline/,
    );
    await assert.rejects(
      installMaterials(
        fixture(),
        lock,
        cache,
        output,
        async () => new Response(new Uint8Array(4 * 1024 * 1024 + 1)),
      ),
      /size limit/,
    );
    await assert.rejects(readFile(join(output, "inventory.json")), { code: "ENOENT" });
  });
});
