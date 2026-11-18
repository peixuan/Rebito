import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, globSync, readFileSync } from "node:fs";

// Run through stdin inside the built image; this also checks a clean omit install.
for (const name of [
  "vue",
  "primevue",
  "vue-i18n",
  "@intlify/unplugin-vue-i18n",
  "@intlify/message-compiler",
  "@primeuix/themes",
  "@vue/compiler-sfc",
  "typescript",
]) {
  assert.equal(existsSync(`node_modules/${name}`), false, `Build-only dependency: ${name}`);
}
const notices = readFileSync("dist/client/THIRD_PARTY_NOTICES.txt", "utf8");
// Check nested installations as well as bundled browser modules.
for (const path of globSync("node_modules/**/package.json")) {
  const metadata = JSON.parse(readFileSync(path, "utf8"));
  assert.notEqual(metadata.name, "picomatch", `Build matcher shipped in image: ${path}`);
}
const browser = JSON.parse(readFileSync("dist/client/BROWSER_DEPENDENCIES.json", "utf8"));
assert.equal(browser.version, 1);
assert.ok(browser.packages.length > 0);
assert.ok(browser.packages.every((item) => item.name !== "picomatch"));
const project = JSON.parse(readFileSync("package.json", "utf8"));
const license = readFileSync("LICENSE", "utf8");
const notice = readFileSync("NOTICE", "utf8");
assert.equal(project.license, "AGPL-3.0-or-later");
assert.ok(license.includes("GNU AFFERO GENERAL PUBLIC LICENSE"));
assert.ok(notice.includes("Rebito contributors"));
assert.ok(notice.includes("AGPL-3.0-or-later"));
assert.ok(notices.includes(`${project.name}@${project.version}`));
assert.ok(notices.includes(license.trim()));
assert.ok(notices.includes(notice.trim()));
for (const name of ["@vue/runtime-core", "primevue", "vue-i18n", "fflate"]) {
  assert.ok(notices.includes(`${name}@`), `Missing bundled notice: ${name}`);
}
assert.ok(notices.includes("Permission is hereby granted"));
const materials = JSON.parse(readFileSync("dist/client/runtimes/legal/inventory.json", "utf8"));
const { createApp } = await import("./dist/server/app.js");
const { registerWeb } = await import("./dist/server/web.js");
const app = createApp({ write() {} });
try {
  registerWeb(app, `${process.cwd()}/dist/client`);
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  for (const component of materials.components) {
    for (const material of component.materials) {
      const path = `/runtimes/legal/${material.sha256}.txt`;
      const response = await fetch(`${address}${path}`, { signal: AbortSignal.timeout(3000) });
      assert.equal(response.status, 200, `Missing material: ${component.id}/${material.path}`);
      assert.match(response.headers.get("content-type"), /^text\/plain/);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(createHash("sha256").update(bytes).digest("hex"), material.sha256);
      assert.deepEqual(bytes, readFileSync(`dist/client${path}`));
    }
  }
} finally {
  await app.close();
}
console.log("Image excludes build dependencies and serves verified runtime materials and notices.");
