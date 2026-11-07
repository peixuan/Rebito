import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

const root = "client/locales";
function catalog(locale: string) {
  const result: Record<string, string> = {};
  for (const file of readdirSync(join(root, locale), { recursive: true })) {
    if (typeof file !== "string" || !file.endsWith(".json")) continue;
    const values: Record<string, unknown> = JSON.parse(
      readFileSync(join(root, locale, file), "utf8"),
    );
    for (const [key, value] of Object.entries(values)) {
      expect(Object.hasOwn(result, key), `${locale}/${file}: duplicate ${key}`).toBe(false);
      expect(typeof value, `${locale}/${file}: ${key}`).toBe("string");
      result[key] = String(value);
    }
  }
  return result;
}
const en = catalog("en");
const zh = catalog("zh-CN");
const shared: Record<string, string> = {};
const parameters = (value: string) =>
  [...new Set([...value.matchAll(/\{([a-zA-Z]\w*)\}/g)].map((match) => match[1]))].sort();

it("keeps translated keys and named interpolation values in parity", () => {
  expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  for (const [key, value] of Object.entries(en)) {
    expect(parameters(zh[key] ?? ""), key).toEqual(parameters(value));
    expect(Object.hasOwn(shared, key), `shared key collides with ${key}`).toBe(false);
  }
});

it("compiles every message and preserves interpolated user content as text", () => {
  const warnings: string[] = [];
  const warn = vi
    .spyOn(console, "warn")
    .mockImplementation((value) => warnings.push(String(value)));
  const instance = createI18n({
    legacy: false,
    locale: "en",
    messages: { en: { ...en, ...shared }, "zh-CN": { ...zh, ...shared } },
    messageResolver: (messages, key) => (messages as Record<string, string>)[key] ?? null,
  });
  try {
    for (const locale of ["en", "zh-CN"] as const) {
      instance.global.locale.value = locale;
      for (const [key, value] of Object.entries({ ...(locale === "en" ? en : zh), ...shared })) {
        const named = Object.fromEntries(
          parameters(value).map((name) => [name, name === "count" ? 2 : "<b>user</b>"]),
        );
        const rendered = instance.global.t(key, named);
        expect(rendered, `${locale}: ${key}`).not.toBe(key);
        expect(rendered.length, `${locale}: ${key}`).toBeGreaterThan(0);
        if (Object.values(named).includes("<b>user</b>"))
          expect(rendered, `${locale}: ${key}`).toContain("<b>user</b>");
      }
    }
    expect(warnings).toEqual([]);
  } finally {
    warn.mockRestore();
  }
});

it("keeps Han characters in language packs and the opening README introduction", () => {
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: "..",
    encoding: "utf8",
  })
    .trim()
    .split(/\r?\n/);
  for (const path of paths) {
    if (!/\.(?:[cm]?ts|[cm]?js|vue|html|css|json|ya?ml|toml|sh)$/.test(path)) continue;
    if (path.startsWith("platform/client/locales/")) continue;
    expect(readFileSync(join("..", path), "utf8"), path).not.toMatch(/\p{Script=Han}/u);
  }
  const readme = readFileSync("../README.md", "utf8");
  expect(readme.slice(readme.indexOf("## "))).not.toMatch(/\p{Script=Han}/u);
});

it("provides every literal message key referenced by the application", () => {
  const available = { ...en, ...shared };
  for (const directory of ["src", "client"]) {
    for (const file of readdirSync(directory, { recursive: true })) {
      if (typeof file !== "string" || !/\.(ts|vue)$/.test(file)) continue;
      const source = readFileSync(join(directory, file), "utf8");
      for (const match of source.matchAll(/\b(?:message|t)\(\s*["']([a-z][\w.]+)["']/g))
        expect(Object.hasOwn(available, match[1] ?? ""), `${directory}/${file}: ${match[1]}`).toBe(
          true,
        );
    }
  }
});
